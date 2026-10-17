import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { deleteObject, ref, uploadBytesResumable, getBytes } from 'firebase/storage';
import { invoke } from '@tauri-apps/api/core';
import { auth, db, storage } from './firebase';
import { SharedFileDocument } from '../types/schema';

export const SHARED_FILE_CHUNK_BYTES = 8 * 1024 * 1024;
const CHUNKS_PER_FILE = 1_000_000;
interface DiskFile { name: string; relative_path: string; is_dir: boolean; size_bytes: number; }

function fileDocumentId(relativePath: string): string {
  const bytes = new TextEncoder().encode(relativePath);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function chunkName(index: number) { return index.toString().padStart(8, '0'); }
function chunkCount(size: number) { return Math.max(1, Math.ceil(size / SHARED_FILE_CHUNK_BYTES)); }
function uploadChunk(path: string, bytes: Uint8Array, metadata: Record<string, string>, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), bytes, { contentType: 'application/octet-stream', customMetadata: metadata });
    task.on('state_changed', snapshot => onProgress(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 1), reject, () => resolve());
  });
}

async function deleteRevision(storagePath: string, count: number) {
  await Promise.allSettled(Array.from({ length: count }, (_, i) => deleteObject(ref(storage, `${storagePath}/${chunkName(i)}`))));
}

export async function uploadServerFiles(groupId: string, serverFolder: string, userName: string, onProgress: (completed: number, total: number) => void): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión antes de compartir archivos.');
  const files = (await invoke<DiskFile[]>('list_server_files', { basePath: serverFolder })).filter(file => !file.is_dir);
  if (!files.length) throw new Error('No se encontraron archivos en la carpeta del servidor.');
  const totalChunks = files.reduce((sum, file) => sum + chunkCount(file.size_bytes), 0);
  if (files.some(file => chunkCount(file.size_bytes) > CHUNKS_PER_FILE)) throw new Error('Uno de los archivos supera el máximo permitido de fragmentos.');

  let completedChunks = 0;
  const report = (partial = 0) => onProgress(completedChunks + partial, totalChunks);
  for (const file of files) {
    const id = fileDocumentId(file.relative_path);
    const revision = crypto.randomUUID();
    const storagePath = `groups/${groupId}/shared-files/${id}/${revision}`;
    const count = chunkCount(file.size_bytes);
    let uploaded = 0;
    try {
      for (let index = 0; index < count; index++) {
        const offset = index * SHARED_FILE_CHUNK_BYTES;
        const length = Math.min(SHARED_FILE_CHUNK_BYTES, Math.max(0, file.size_bytes - offset));
        const raw = await invoke<number[]>('read_server_file_chunk', { basePath: serverFolder, relativePath: file.relative_path, offset, chunkSize: length });
        await uploadChunk(`${storagePath}/${chunkName(index)}`, new Uint8Array(raw), { relativePath: file.relative_path, uploadedBy: user.uid }, fraction => report(fraction));
        uploaded++;
        completedChunks++;
        report();
      }
      const metadata: SharedFileDocument = { id, name: file.name, relativePath: file.relative_path, storagePath, sizeBytes: file.size_bytes, chunkCount: count, chunkSize: SHARED_FILE_CHUNK_BYTES, uploadedBy: user.uid, uploadedByName: userName, updatedAt: Date.now() };
      const metadataRef = doc(db, 'groups', groupId, 'shared_files', id);
      const previous = await getDoc(metadataRef);
      await setDoc(metadataRef, metadata);
      if (previous.exists()) {
        const old = previous.data() as SharedFileDocument;
        if (old.storagePath !== storagePath) {
          if (old.chunkCount) await deleteRevision(old.storagePath, old.chunkCount);
          else await deleteObject(ref(storage, old.storagePath)).catch(() => undefined);
        }
      }
    } catch (error) {
      if (uploaded) await deleteRevision(storagePath, uploaded);
      throw error;
    }
  }
  onProgress(totalChunks, totalChunks);
  return files.length;
}

export async function downloadSharedFiles(files: SharedFileDocument[], serverFolder: string, onProgress: (completed: number, total: number) => void): Promise<number> {
  if (!files.length) throw new Error('Este grupo aún no tiene archivos compartidos.');
  const totalChunks = files.reduce((sum, file) => sum + (file.chunkCount || 1), 0);
  let completed = 0;
  for (const file of files) {
    const count = file.chunkCount || 1;
    const size = file.sizeBytes;
    const fileId = crypto.randomUUID();
    await invoke('start_server_file_download', { basePath: serverFolder, relativePath: file.relativePath, fileId, totalSize: size });
    try {
      for (let index = 0; index < count; index++) {
        const path = file.chunkCount ? `${file.storagePath}/${chunkName(index)}` : file.storagePath;
        const bytes = new Uint8Array(await getBytes(ref(storage, path)));
        const offset = file.chunkCount ? index * (file.chunkSize || SHARED_FILE_CHUNK_BYTES) : 0;
        await invoke('write_server_file_chunk', { basePath: serverFolder, fileId, offset, content: Array.from(bytes) });
        completed++;
        onProgress(completed, totalChunks);
      }
      await invoke('finish_server_file_download', { basePath: serverFolder, relativePath: file.relativePath, fileId, totalSize: size });
    } catch (error) {
      await invoke('cancel_server_file_download', { basePath: serverFolder, fileId }).catch(() => undefined);
      throw error;
    }
  }
  return files.length;
}

export async function deleteSharedFile(groupId: string, file: SharedFileDocument): Promise<void> {
  if (file.chunkCount) await deleteRevision(file.storagePath, file.chunkCount);
  else await deleteObject(ref(storage, file.storagePath));
  await deleteDoc(doc(db, 'groups', groupId, 'shared_files', file.id));
}
