import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as THREE from 'three';
import {
  Boxes,
  Box,
  Layers,
  Search,
  RotateCcw,
  Sparkles,
  RefreshCw,
  HardDrive,
  Copy,
  Check,
  Grid3X3,
  FileCode,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Info,
  Maximize2
} from 'lucide-react';

interface HyCreatorItem {
  rel: string;
  name: string;
  kind: string;
}

interface HyCreatorInfo {
  is_available: boolean;
  hycreator_dir: string;
  assets_zip_path: string | null;
  available_scans: string[];
  active_scan_path: string | null;
  total_prefabs: number;
  total_blockymodels: number;
  total_models: number;
  total_items: number;
}

interface CatalogPageResult {
  total: number;
  page: number;
  page_size: number;
  items: HyCreatorItem[];
}

interface AssetContentResult {
  rel_path: string;
  format: string;
  content: string;
  size_bytes: number;
}

interface HyCreatorViewerProps {
  serverFolder?: string;
  localSyncFolder?: string;
}

// Paleta inteligente de colores para bloques de Hytale basada en nombres de materiales
function getHytaleBlockColor(name: string): number {
  const lower = name.toLowerCase();

  // Maderas y troncos
  if (lower.includes('oak') || lower.includes('wood') || lower.includes('log') || lower.includes('plank')) {
    if (lower.includes('dark')) return 0x4a3219;
    if (lower.includes('birch')) return 0xd9cbb2;
    if (lower.includes('bark')) return 0x5a3e23;
    return 0x8a5a36;
  }
  // Rocas, piedras, adoquines
  if (lower.includes('stone') || lower.includes('rock') || lower.includes('cobble') || lower.includes('slate')) {
    if (lower.includes('sandstone')) return 0xd6b77a;
    if (lower.includes('white')) return 0xe2ded4;
    if (lower.includes('black') || lower.includes('basalt')) return 0x22252a;
    if (lower.includes('granite')) return 0x9e6757;
    return 0x7a7e85;
  }
  // Vegetación y follaje
  if (lower.includes('leaf') || lower.includes('leaves') || lower.includes('grass') || lower.includes('plant') || lower.includes('moss') || lower.includes('cact')) {
    if (lower.includes('pine')) return 0x2e5934;
    if (lower.includes('dry')) return 0x828448;
    return 0x4d8c39;
  }
  // Lana / Tela con colores
  if (lower.includes('cloth') || lower.includes('wool')) {
    if (lower.includes('white')) return 0xefede6;
    if (lower.includes('gray') || lower.includes('grey')) return 0x6e7379;
    if (lower.includes('black')) return 0x1f2022;
    if (lower.includes('red')) return 0xb02e26;
    if (lower.includes('blue')) return 0x3c44aa;
    if (lower.includes('green')) return 0x5e7c16;
    if (lower.includes('yellow')) return 0xfed83d;
    if (lower.includes('purple')) return 0x8932b8;
    if (lower.includes('cyan')) return 0x169c9c;
    if (lower.includes('orange')) return 0xf9801d;
    if (lower.includes('pink')) return 0xf38baa;
    return 0xc7c3b9;
  }
  // Metales y minerales
  if (lower.includes('gold')) return 0xf4c430;
  if (lower.includes('iron') || lower.includes('steel') || lower.includes('metal') || lower.includes('anvil')) return 0x9ea1a5;
  if (lower.includes('copper')) return 0xc16a44;
  if (lower.includes('diamond') || lower.includes('crystal') || lower.includes('gem')) return 0x4deeea;
  if (lower.includes('coal') || lower.includes('charcoal')) return 0x2b2b2b;
  // Líquidos y elementos
  if (lower.includes('water')) return 0x2e6fbb;
  if (lower.includes('lava') || lower.includes('fire')) return 0xd34714;
  if (lower.includes('ice') || lower.includes('snow')) return 0xe8f4f8;
  if (lower.includes('glass')) return 0xaad5df;
  if (lower.includes('sand') || lower.includes('dirt') || lower.includes('soil')) return 0xbf9b68;
  if (lower.includes('brick')) return 0x934b3e;

  // Hash determinista para dar colores variados y consistentes a otros bloques
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff);
  return c;
}

// Limpiar recursivamente geometrías y materiales de un grupo Three.js
function disposeGroup(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else if (mesh.material) {
        (mesh.material as THREE.Material).dispose();
      }
    }
  });
}

export function HyCreatorViewer({ serverFolder, localSyncFolder }: HyCreatorViewerProps) {
  // Estado de detección de HyCreator
  const [info, setInfo] = useState<HyCreatorInfo | null>(null);
  const [, setLoadingInfo] = useState<boolean>(true);

  // Origen de datos: 'hycreator' (scan de Assets.zip) vs 'local' (carpeta del servidor actual)
  const [dataSource, setDataSource] = useState<'hycreator' | 'local'>('hycreator');

  // Filtros del catálogo
  const [activeCategory, setActiveCategory] = useState<string>('Prefabs');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [catalogItems, setCatalogItems] = useState<HyCreatorItem[]>([]);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);

  // Elemento 3D seleccionado actualmente
  const [selectedItem, setSelectedItem] = useState<HyCreatorItem | null>(null);
  const [loadingAsset, setLoadingAsset] = useState<boolean>(false);
  const [assetData, setAssetData] = useState<AssetContentResult | null>(null);
  const [assetError, setAssetError] = useState<string>('');

  // Estadísticas del modelo / prefab 3D cargado
  const [modelStats, setModelStats] = useState<{
    totalBlocks?: number;
    dimensions?: { x: number; y: number; z: number };
    anchor?: { x: number; y: number; z: number };
    uniqueBlocks?: { name: string; count: number }[];
    nodeCount?: number;
  }>({});

  // Configuración de renderizado 3D en el viewport
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [sceneBg, setSceneBg] = useState<'oled' | 'studio' | 'sky' | 'grid'>('oled');
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // FIX: usar ref para autoRotate en animation loop (evita stale closure)
  const autoRotateRef = useRef<boolean>(false);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  // Referencias para el canvas Three.js
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const threeStateRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    modelGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    isDragging: boolean;
    prevMousePos: { x: number; y: number };
    cameraTarget: THREE.Vector3;
    distance: number;
    rotation: { theta: number; phi: number };
    updateCameraPos: () => void;
  } | null>(null);

  // 1. Cargar información de HyCreator al montar
  useEffect(() => {
    (async () => {
      setLoadingInfo(true);
      try {
        const res = await invoke<HyCreatorInfo>('hycreator_get_info');
        setInfo(res);
      } catch (err) {
        console.warn('Error al detectar HyCreator:', err);
      } finally {
        setLoadingInfo(false);
      }
    })();
  }, []);

  // 2. Cargar items del catálogo según los filtros
  useEffect(() => {
    let cancelled = false;
    const fetchCatalog = async () => {
      setLoadingCatalog(true);
      try {
        if (dataSource === 'hycreator') {
          const kindParam = activeCategory === 'Todos' ? '' : activeCategory;
          const res = await invoke<CatalogPageResult>('hycreator_get_catalog_items', {
            scanFile: info?.active_scan_path || null,
            filterKind: kindParam || null,
            searchTerm: searchQuery || null,
            page: currentPage,
            pageSize: 40,
          });
          if (!cancelled) {
            setCatalogItems(res.items);
            setTotalItems(res.total);
            if (!selectedItem && res.items.length > 0) {
              setSelectedItem(res.items[0]);
            }
          }
        } else {
          // Escanear carpeta local del servidor / sync
          const targetDir = localSyncFolder || serverFolder || '';
          if (targetDir) {
            const res = await invoke<HyCreatorItem[]>('hycreator_scan_local_prefabs', {
              folderPath: targetDir,
            });
            if (!cancelled) {
              const filtered = res.filter(it => {
                const matchSearch = !searchQuery || it.name.toLowerCase().includes(searchQuery.toLowerCase());
                const matchCat = activeCategory === 'Todos' || it.kind.toLowerCase() === activeCategory.toLowerCase();
                return matchSearch && matchCat;
              });
              setTotalItems(filtered.length);
              const start = (currentPage - 1) * 40;
              setCatalogItems(filtered.slice(start, start + 40));
              if (!selectedItem && filtered.length > 0) {
                setSelectedItem(filtered[0]);
              }
            }
          } else {
            setCatalogItems([]);
            setTotalItems(0);
          }
        }
      } catch (err: any) {
        console.warn('Error al cargar catálogo:', err);
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    };

    fetchCatalog();
    return () => { cancelled = true; };
  }, [dataSource, activeCategory, searchQuery, currentPage, info?.active_scan_path, serverFolder, localSyncFolder]);

  // 3. Inicializar Three.js en el contenedor del Canvas
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // Escena, Cámara y Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(25, 20, 25);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(40, 60, 40);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x7fb5ff, 0.5);
    dirLight2.position.set(-30, 20, -30);
    scene.add(dirLight2);

    // Suelo con Grid
    const gridHelper = new THREE.GridHelper(60, 60, 0x4f46e5, 0x1e293b);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Grupo para contener el objeto 3D activo
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // Controles de órbita manuales ultra-suaves
    const rotation = { theta: Math.PI / 4, phi: Math.PI / 4 };
    let distance = 35;
    const cameraTarget = new THREE.Vector3(0, 0, 0);

    const updateCameraPos = () => {
      const x = cameraTarget.x + distance * Math.sin(rotation.phi) * Math.sin(rotation.theta);
      const y = cameraTarget.y + distance * Math.cos(rotation.phi);
      const z = cameraTarget.z + distance * Math.sin(rotation.phi) * Math.cos(rotation.theta);
      camera.position.set(x, y, z);
      camera.lookAt(cameraTarget);
    };
    updateCameraPos();

    const threeState = {
      scene,
      camera,
      renderer,
      modelGroup,
      gridHelper,
      isDragging: false,
      prevMousePos: { x: 0, y: 0 },
      cameraTarget,
      distance,
      rotation,
      updateCameraPos,
    };
    threeStateRef.current = threeState;

    // Manejo de eventos de ratón
    const onMouseDown = (e: MouseEvent) => {
      threeState.isDragging = true;
      threeState.prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!threeState.isDragging) return;
      const dx = e.clientX - threeState.prevMousePos.x;
      const dy = e.clientY - threeState.prevMousePos.y;
      threeState.prevMousePos = { x: e.clientX, y: e.clientY };

      if (e.buttons === 1) {
        // Clic izquierdo: orbitar
        rotation.theta -= dx * 0.008;
        rotation.phi = Math.max(0.05, Math.min(Math.PI - 0.05, rotation.phi - dy * 0.008));
        updateCameraPos();
      } else if (e.buttons === 2 || e.shiftKey) {
        // Clic derecho o Shift: desplazar (pan)
        const panSpeed = threeState.distance * 0.0015;
        const forward = new THREE.Vector3().subVectors(cameraTarget, camera.position).normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();

        cameraTarget.addScaledVector(right, -dx * panSpeed);
        cameraTarget.addScaledVector(up, dy * panSpeed);
        updateCameraPos();
      }
    };

    const onMouseUp = () => { threeState.isDragging = false; };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      distance = Math.max(2, Math.min(300, distance + e.deltaY * 0.05));
      threeState.distance = distance;
      updateCameraPos();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // FIX: Animation Loop usa ref en lugar de closure capturada al mount
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (autoRotateRef.current && !threeState.isDragging) {
        rotation.theta += 0.008;
        updateCameraPos();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      // FIX: dispose recursivo de todo el grupo
      disposeGroup(modelGroup);
      renderer.dispose();
      threeStateRef.current = null;
    };
  // Solo se monta una vez — no depende de autoRotate (fix del stale closure)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualizar color de fondo y visibilidad de Grid
  useEffect(() => {
    if (!threeStateRef.current) return;
    const { scene, gridHelper } = threeStateRef.current;
    gridHelper.visible = showGrid;

    switch (sceneBg) {
      case 'oled':   scene.background = new THREE.Color(0x05070d); break;
      case 'studio': scene.background = new THREE.Color(0x131927); break;
      case 'sky':    scene.background = new THREE.Color(0x7ca9d8); break;
      case 'grid':   scene.background = new THREE.Color(0x0e1726); break;
    }
  }, [sceneBg, showGrid]);

  // FIX: Wireframe reactivo — recorre la escena y actualiza materiales al cambiar
  useEffect(() => {
    if (!threeStateRef.current) return;
    const { modelGroup } = threeStateRef.current;
    modelGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => { (m as THREE.MeshStandardMaterial).wireframe = showWireframe; });
        } else if (mesh.material) {
          (mesh.material as THREE.MeshStandardMaterial).wireframe = showWireframe;
        }
      }
    });
    // Para InstancedMesh también
    threeStateRef.current.modelGroup.children.forEach(child => {
      if ((child as THREE.InstancedMesh).isInstancedMesh) {
        const im = child as THREE.InstancedMesh;
        if (Array.isArray(im.material)) {
          im.material.forEach(m => { (m as THREE.MeshStandardMaterial).wireframe = showWireframe; });
        } else {
          (im.material as THREE.MeshStandardMaterial).wireframe = showWireframe;
        }
      }
    });
  }, [showWireframe]);

  // 4. Cargar y construir el modelo 3D cuando cambia el elemento seleccionado
  useEffect(() => {
    if (!selectedItem) return;
    let isCancelled = false;

    const load3DAsset = async () => {
      setLoadingAsset(true);
      setAssetError('');
      try {
        const workingDir = (localSyncFolder || serverFolder || undefined);
        const res = await invoke<AssetContentResult>('hycreator_read_asset', {
          relPath: selectedItem.rel,
          assetsZipOverride: info?.assets_zip_path || null,
          workingFolder: workingDir || null,
        });

        if (isCancelled) return;
        setAssetData(res);

        // FIX: guard para escena Three.js no inicializada aún
        if (!threeStateRef.current) {
          console.warn('Three.js scene no está lista todavía, reintentando...');
          return;
        }

        // Construir el modelo 3D en la escena Three.js
        renderInThreeScene(res.content, selectedItem);
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Error al cargar asset 3D:', err);
          setAssetError(typeof err === 'string' ? err : 'No se pudo leer el archivo 3D seleccionado.');
          if (threeStateRef.current) {
            clearModelGroup(threeStateRef.current.modelGroup);
          }
        }
      } finally {
        if (!isCancelled) setLoadingAsset(false);
      }
    };

    load3DAsset();
    return () => { isCancelled = true; };
  }, [selectedItem, info?.assets_zip_path, serverFolder, localSyncFolder]);

  // Limpiar geometrías y materiales de Three.js para evitar memory leaks (recursivo)
  const clearModelGroup = useCallback((group: THREE.Group) => {
    disposeGroup(group);
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }, []);

  // Re-encuadrar cámara en el centro del objeto 3D
  const fitCameraToObject = useCallback((dx: number, dy: number, dz: number) => {
    if (!threeStateRef.current) return;
    const { camera, cameraTarget, rotation, updateCameraPos } = threeStateRef.current;
    const maxDim = Math.max(dx, dy, dz, 4);
    const targetDist = maxDim * 1.8;

    cameraTarget.set(0, dy / 2, 0);
    threeStateRef.current.distance = targetDist;
    rotation.theta = Math.PI / 4;
    rotation.phi = Math.PI / 3;

    const x = cameraTarget.x + targetDist * Math.sin(Math.PI / 3) * Math.sin(Math.PI / 4);
    const y = cameraTarget.y + targetDist * Math.cos(Math.PI / 3);
    const z = cameraTarget.z + targetDist * Math.sin(Math.PI / 3) * Math.cos(Math.PI / 4);
    camera.position.set(x, y, z);
    camera.lookAt(cameraTarget);
    updateCameraPos();
  }, []);

  // Renderizar contenido en el viewport Three.js
  const renderInThreeScene = useCallback((jsonString: string, item: HyCreatorItem) => {
    if (!threeStateRef.current) return;
    const { modelGroup } = threeStateRef.current;

    // Limpiar geometrías previas (recursivo)
    clearModelGroup(modelGroup);

    try {
      const data = JSON.parse(jsonString);

      // CASO A: PREFAB (.prefab.json)
      if (data.blocks && Array.isArray(data.blocks)) {
        renderPrefabBlocks(data, modelGroup);
      }
      // CASO B: BLOCKYMODEL (.blockymodel o .bbmodel con nodes)
      else if (data.nodes && Array.isArray(data.nodes)) {
        renderBlockyModel(data, modelGroup);
      }
      // CASO C: MODELOS ESTILO BLOCKBENCH ELEMENTS
      else if (data.elements && Array.isArray(data.elements)) {
        renderBlockbenchElements(data, modelGroup);
      } else {
        // Archivo JSON genérico con datos de item/entidad
        renderGenericItemBox(modelGroup, item.name);
      }
    } catch (err) {
      console.warn('No se pudo parsear el archivo como JSON 3D:', err);
      setAssetError('El archivo no tiene una estructura de prefab o modelo 3D reconocida.');
    }
  }, [clearModelGroup, fitCameraToObject]);

  // Renderizador de Prefabs Hytale optimizado con InstancedMesh
  const renderPrefabBlocks = useCallback((prefab: any, group: THREE.Group) => {
    const blocks: Array<{ x: number; y: number; z: number; name: string }> = prefab.blocks;
    if (blocks.length === 0) return;

    // Calcular límites espaciales (Bounding Box)
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const blockTypeCountMap = new Map<string, number>();

    for (const b of blocks) {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
      if (b.z < minZ) minZ = b.z;
      if (b.z > maxZ) maxZ = b.z;
      blockTypeCountMap.set(b.name, (blockTypeCountMap.get(b.name) || 0) + 1);
    }

    const dimX = maxX - minX + 1;
    const dimY = maxY - minY + 1;
    const dimZ = maxZ - minZ + 1;

    const sortedTypes = Array.from(blockTypeCountMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    setModelStats({
      totalBlocks: blocks.length,
      dimensions: { x: dimX, y: dimY, z: dimZ },
      anchor: { x: prefab.anchorX || 0, y: prefab.anchorY || 0, z: prefab.anchorZ || 0 },
      uniqueBlocks: sortedTypes,
    });

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const baseY = minY;

    const cubeGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0.15,
      wireframe: showWireframe,
    });

    const instancedMesh = new THREE.InstancedMesh(cubeGeo, material, blocks.length);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      matrix.setPosition(b.x - centerX, b.y - baseY + 0.5, b.z - centerZ);
      instancedMesh.setMatrixAt(i, matrix);
      color.setHex(getHytaleBlockColor(b.name));
      instancedMesh.setColorAt(i, color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    group.add(instancedMesh);
    fitCameraToObject(dimX, dimY, dimZ);
  }, [showWireframe, fitCameraToObject]);

  // Renderizador de BlockyModels (.blockymodel de Hytale)
  const renderBlockyModel = useCallback((data: any, group: THREE.Group) => {
    let nodeCount = 0;

    const processNodes = (nodes: any[], parentGroup: THREE.Group) => {
      for (const node of nodes) {
        nodeCount++;
        const nodeObj = new THREE.Group();
        nodeObj.name = node.name || `node_${node.id || nodeCount}`;

        if (node.position) {
          nodeObj.position.set(node.position.x || 0, node.position.y || 0, node.position.z || 0);
        }
        if (node.orientation) {
          nodeObj.quaternion.set(
            node.orientation.x || 0,
            node.orientation.y || 0,
            node.orientation.z || 0,
            node.orientation.w !== undefined ? node.orientation.w : 1
          );
        }

        if (node.shape) {
          const stretch = node.shape.stretch || { x: 1, y: 1, z: 1 };
          const offset = node.shape.offset || { x: 0, y: 0, z: 0 };
          const sizeX = Math.max(0.1, Math.abs(stretch.x || 1));
          const sizeY = Math.max(0.1, Math.abs(stretch.y || 1));
          const sizeZ = Math.max(0.1, Math.abs(stretch.z || 1));

          const boxGeo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
          const mat = new THREE.MeshStandardMaterial({
            color: getHytaleBlockColor(node.name || 'metal_iron'),
            roughness: 0.5,
            metalness: 0.25,
            wireframe: showWireframe,
          });

          const mesh = new THREE.Mesh(boxGeo, mat);
          mesh.position.set(offset.x || 0, offset.y || 0, offset.z || 0);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          nodeObj.add(mesh);
        }

        if (node.children && Array.isArray(node.children)) {
          processNodes(node.children, nodeObj);
        }

        parentGroup.add(nodeObj);
      }
    };

    processNodes(data.nodes, group);

    const bbox = new THREE.Box3().setFromObject(group);
    const size = bbox.getSize(new THREE.Vector3());

    setModelStats({
      nodeCount,
      dimensions: {
        x: Math.round(size.x * 10) / 10,
        y: Math.round(size.y * 10) / 10,
        z: Math.round(size.z * 10) / 10,
      },
    });

    fitCameraToObject(size.x, size.y, size.z);
  }, [showWireframe, fitCameraToObject]);

  // Renderizador de elementos Blockbench estándar
  const renderBlockbenchElements = useCallback((data: any, group: THREE.Group) => {
    const elements: any[] = data.elements;
    let count = 0;

    for (const el of elements) {
      count++;
      const from = el.from || [0, 0, 0];
      const to = el.to || [1, 1, 1];
      const sizeX = Math.abs(to[0] - from[0]);
      const sizeY = Math.abs(to[1] - from[1]);
      const sizeZ = Math.abs(to[2] - from[2]);

      const boxGeo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      const mat = new THREE.MeshStandardMaterial({
        color: getHytaleBlockColor(el.name || 'wood'),
        roughness: 0.6,
        wireframe: showWireframe,
      });

      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
      mesh.castShadow = true;
      group.add(mesh);
    }

    const bbox = new THREE.Box3().setFromObject(group);
    const size = bbox.getSize(new THREE.Vector3());

    setModelStats({
      nodeCount: count,
      dimensions: {
        x: Math.round(size.x * 10) / 10,
        y: Math.round(size.y * 10) / 10,
        z: Math.round(size.z * 10) / 10,
      },
    });

    fitCameraToObject(size.x, size.y, size.z);
  }, [showWireframe, fitCameraToObject]);

  // Fallback para items genéricos
  const renderGenericItemBox = useCallback((group: THREE.Group, itemName: string) => {
    const geo = new THREE.BoxGeometry(2, 2, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: getHytaleBlockColor(itemName),
      roughness: 0.4,
      metalness: 0.3,
      wireframe: showWireframe,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1;
    group.add(mesh);

    setModelStats({ nodeCount: 1, dimensions: { x: 2, y: 2, z: 2 } });
    fitCameraToObject(2, 2, 2);
  }, [showWireframe, fitCameraToObject]);

  // Copiar código JSON al portapapeles
  const handleCopyJson = async () => {
    if (!assetData?.content) return;
    try {
      await navigator.clipboard.writeText(assetData.content);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* 1. BARRA SUPERIOR: ESTADO DE HYCREATOR Y SELECCIÓN DE ORIGEN */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 rounded-xl border border-indigo-500/30 text-cyan-400 shadow-inner">
            <Boxes className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">Visor 3D de Prefabs y Modelos Hytale</h2>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                HyCreator Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Renderizado tridimensional de estructuras, bloques y entidades de Hytale en tiempo real con WebGL.
            </p>
          </div>
        </div>

        {/* Origen de Datos: HyCreator Catalog vs Carpeta Local */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => { setDataSource('hycreator'); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              dataSource === 'hycreator'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            Catálogo Oficial HyCreator
          </button>
          <button
            onClick={() => { setDataSource('local'); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              dataSource === 'local'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-300" />
            Carpeta del Servidor
          </button>
        </div>
      </div>

      {/* 2. CUERPO PRINCIPAL: EXPLORADOR LATERAL + VISOR 3D CENTRAL + PANEL DE DETALLES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-[560px]">
        
        {/* PANEL IZQUIERDO: LISTA DE ELEMENTOS Y FILTROS (3 Columnas) */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col shadow-xl overflow-hidden">
          {/* Buscador */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar prefab o modelo..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 placeholder-slate-600 transition-all"
            />
          </div>

          {/* Categorías */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
            {['Prefabs', 'blockymodel', 'Item', 'Todos'].map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setCurrentPage(1); }}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                }`}
              >
                {cat === 'Prefabs' ? '🏰 Prefabs' : cat === 'blockymodel' ? '🧊 Modelos' : cat === 'Item' ? '⚔️ Items' : '✨ Todos'}
              </button>
            ))}
          </div>

          {/* Contador y Estado */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 px-1">
            <span>{totalItems} elementos disponibles</span>
            {loadingCatalog && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
          </div>

          {/* Lista de Resultados */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {catalogItems.length === 0 ? (
              <div className="text-center py-12 px-3 text-xs text-slate-500">
                {loadingCatalog ? 'Cargando catálogo 3D...' : 'No se encontraron prefabs o modelos con ese criterio.'}
              </div>
            ) : (
              catalogItems.map((item) => {
                const isSelected = selectedItem?.rel === item.rel;
                return (
                  <div
                    key={item.rel}
                    onClick={() => setSelectedItem(item)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-600/30 to-cyan-600/20 border border-indigo-500/40 text-white font-semibold shadow-md'
                        : 'bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.kind === 'Prefabs' ? (
                        <Layers className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-cyan-400' : 'text-indigo-400'}`} />
                      ) : (
                        <Box className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                      )}
                      <span className="truncate text-xs">{item.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono ml-2 flex-shrink-0">
                      {item.kind === 'Prefabs' ? 'Voxel' : item.kind === 'blockymodel' ? 'Mesh' : item.kind}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Paginador */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-800 text-xs">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-800 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-slate-400 font-mono">
              Página {currentPage} de {Math.max(1, Math.ceil(totalItems / 40))}
            </span>
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage * 40 >= totalItems}
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-800 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PANEL CENTRAL: VISOR 3D (CANVAS THREE.JS) (6 Columnas) */}
        <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl relative overflow-hidden shadow-2xl flex flex-col">
          {/* Header del Viewport */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-800 shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-white truncate max-w-[220px]">
                {selectedItem ? selectedItem.name : 'Selecciona un modelo'}
              </span>
            </div>

            {/* Herramientas de visualización en escena */}
            <div className="flex items-center gap-1.5 pointer-events-auto bg-slate-900/80 backdrop-blur p-1 rounded-xl border border-slate-800 shadow-lg">
              <button
                onClick={() => setAutoRotate(r => !r)}
                title={autoRotate ? "Detener giro automático" : "Activar giro automático"}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  autoRotate ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <RotateCcw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setShowGrid(g => !g)}
                title="Alternar cuadrícula de suelo"
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  showGrid ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setShowWireframe(w => !w)}
                title="Modo Malla (Wireframe)"
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  showWireframe ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  if (threeStateRef.current && modelStats.dimensions) {
                    const d = modelStats.dimensions;
                    fitCameraToObject(d.x, d.y, d.z);
                  }
                }}
                title="Centrar y encuadrar cámara"
                className="p-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Contenedor del Canvas Three.js */}
          <div ref={canvasContainerRef} className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing">
            {loadingAsset && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
                <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
                <span className="text-xs font-semibold text-slate-200 tracking-wide">Construyendo geometría 3D...</span>
              </div>
            )}
            {assetError && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-20">
                <Info className="w-8 h-8 text-amber-400 mb-2" />
                <p className="text-xs text-amber-200 max-w-md">{assetError}</p>
              </div>
            )}
          </div>

          {/* Guía de controles inferior */}
          <div className="bg-slate-900/60 border-t border-slate-800/80 px-4 py-2 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-4">
              <span>🖱️ Clic izq.: Rotar</span>
              <span>🔍 Rueda: Zoom</span>
              <span>🖱️ Clic der. / Shift: Desplazar</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Fondo:</span>
              {(['oled', 'studio', 'sky', 'grid'] as const).map(bg => (
                <button
                  key={bg}
                  onClick={() => setSceneBg(bg)}
                  className={`w-3.5 h-3.5 rounded-full border ${
                    sceneBg === bg ? 'border-cyan-400 scale-125' : 'border-slate-700'
                  } ${
                    bg === 'oled' ? 'bg-slate-950' : bg === 'studio' ? 'bg-slate-800' : bg === 'sky' ? 'bg-sky-400' : 'bg-indigo-950'
                  }`}
                  title={`Fondo ${bg}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: METADATOS Y COMPONENTES DEL PREFAB/MODELO (3 Columnas) */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col shadow-xl overflow-hidden space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              Detalles del Modelo
            </h3>
            {assetData && (
              <button
                onClick={() => setShowJsonModal(true)}
                title="Ver estructura JSON del archivo"
                className="text-[11px] bg-slate-800 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-300 border border-slate-700 px-2 py-1 rounded-lg flex items-center gap-1.5 transition-all"
              >
                <FileCode className="w-3.5 h-3.5" />
                JSON
              </button>
            )}
          </div>

          {selectedItem ? (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-slate-800 text-xs">
              {/* Información General */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Nombre:</span>
                  <span className="font-semibold text-slate-200 break-all">{selectedItem.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Ruta Relativa:</span>
                  <span className="font-mono text-[11px] text-cyan-400/90 break-all select-all">{selectedItem.rel}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Formato:</span>
                  <span className="font-mono text-[11px] text-emerald-400">{selectedItem.kind}</span>
                </div>
                {assetData && (
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">Peso en Disco:</span>
                    <span className="font-mono text-[11px] text-slate-300">
                      {(assetData.size_bytes / 1024).toFixed(1)} KB ({assetData.size_bytes} bytes)
                    </span>
                  </div>
                )}
              </div>

              {/* Estadísticas 3D del Prefab / Modelo */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
                <span className="text-xs font-bold text-white block">Métricas 3D</span>
                {modelStats.dimensions && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Dimensiones (X, Y, Z):</span>
                    <span className="font-mono font-bold text-cyan-300">
                      {modelStats.dimensions.x} × {modelStats.dimensions.y} × {modelStats.dimensions.z}
                    </span>
                  </div>
                )}
                {modelStats.totalBlocks !== undefined && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Total de Bloques:</span>
                    <span className="font-mono font-bold text-emerald-400">{modelStats.totalBlocks.toLocaleString()}</span>
                  </div>
                )}
                {modelStats.nodeCount !== undefined && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Nodos / Huesos:</span>
                    <span className="font-mono font-bold text-indigo-400">{modelStats.nodeCount}</span>
                  </div>
                )}
                {modelStats.anchor && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Punto de Anclaje:</span>
                    <span className="font-mono text-slate-300">
                      ({modelStats.anchor.x}, {modelStats.anchor.y}, {modelStats.anchor.z})
                    </span>
                  </div>
                )}
              </div>

              {/* Desglose de Bloques (Solo para Prefabs) */}
              {modelStats.uniqueBlocks && modelStats.uniqueBlocks.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Tipos de Bloques ({modelStats.uniqueBlocks.length})
                  </span>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {modelStats.uniqueBlocks.map(b => (
                      <div
                        key={b.name}
                        className="flex items-center justify-between bg-slate-950/70 border border-slate-800/80 px-2.5 py-1.5 rounded-lg text-[11px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: `#${getHytaleBlockColor(b.name).toString(16).padStart(6, '0')}` }}
                          />
                          <span className="truncate text-slate-300 font-mono text-[10px]">{b.name}</span>
                        </div>
                        <span className="font-mono font-semibold text-cyan-400 ml-2">{b.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
              <Box className="w-8 h-8 text-slate-700 mb-2" />
              Selecciona cualquier prefab o modelo de la lista para ver su previsualización interactiva.
            </div>
          )}
        </div>
      </div>

      {/* 3. MODAL DE CÓDIGO JSON SIN PROCESAR */}
      {showJsonModal && assetData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
            <div className="bg-slate-950 px-6 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-white font-mono">{selectedItem?.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all shadow-md"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedJson ? '¡Copiado!' : 'Copiar'}
                </button>
                <button
                  onClick={() => setShowJsonModal(false)}
                  className="text-slate-400 hover:text-white px-2 py-1 rounded-lg text-xs"
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-slate-950 font-mono text-xs text-slate-200">
              <pre className="whitespace-pre-wrap leading-relaxed">{assetData.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
