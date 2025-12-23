
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { AppMode, HandData, ParticleType } from '../types';
import { CONFIG } from '../constants';

interface Scene3DProps {
  mode: AppMode;
  images: string[];
  handData: HandData;
}

const Scene3D: React.FC<Scene3DProps> = ({ mode, images, handData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const particlesRef = useRef<ParticleType[]>([]);
  const mainGroupRef = useRef<THREE.Group>(new THREE.Group());
  const photoGroupRef = useRef<THREE.Group>(new THREE.Group());
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const rotationRef = useRef({ x: 0, y: 0 });
  const lastProcessedImageCount = useRef(0);

  // Digital Font Helper (5x7)
  const DIGITS: { [key: string]: number[][] } = {
    '0': [[1,1,1,1,1], [1,0,0,0,1], [1,0,0,0,1], [1,0,0,0,1], [1,0,0,0,1], [1,0,0,0,1], [1,1,1,1,1]],
    '1': [[0,0,1,0,0], [0,1,1,0,0], [0,0,1,0,0], [0,0,1,0,0], [0,0,1,0,0], [0,0,1,0,0], [0,1,1,1,0]],
    '2': [[1,1,1,1,1], [0,0,0,0,1], [0,0,0,0,1], [1,1,1,1,1], [1,0,0,0,0], [1,0,0,0,0], [1,1,1,1,1]],
    '3': [[1,1,1,1,1], [0,0,0,0,1], [0,0,0,0,1], [0,1,1,1,1], [0,0,0,0,1], [0,0,0,0,1], [1,1,1,1,1]],
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, CONFIG.camera.z);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.0;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(mainGroupRef.current);
    mainGroupRef.current.add(photoGroupRef.current);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(CONFIG.colors.champagneGold, 10, 50);
    pointLight.position.set(0, 10, 0);
    mainGroupRef.current.add(pointLight);

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.8;
    bloomPass.strength = 0.6;
    bloomPass.radius = 0.3;
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    createBaseParticles();

    const animate = () => {
      const frameId = requestAnimationFrame(animate);
      const dt = clockRef.current.getDelta();

      updateRotation(dt);
      updateParticles(dt);

      composer.render();
      return frameId;
    };
    const frameId = animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  const createBaseParticles = () => {
    const goldMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.champagneGold,
      metalness: 1.0, roughness: 0.1,
      emissive: 0x221100, emissiveIntensity: 0.2
    });
    const sphereGeo = new THREE.SphereGeometry(0.5, 12, 12);
    const boxGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);

    // Date Coordinate Mapping Logic
    const fullDateStr = "23122002";
    const datePositions: THREE.Vector3[] = [];
    const spacing = 4;
    const startX = -(fullDateStr.length * spacing) / 2;

    fullDateStr.split('').forEach((digit, idx) => {
      const matrix = DIGITS[digit] || DIGITS['0'];
      matrix.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell === 1) {
            datePositions.push(new THREE.Vector3(
              startX + (idx * spacing) + (cIdx * 0.6),
              4 - (rIdx * 0.6),
              0
            ));
          }
        });
      });
    });

    // Main particles
    for (let i = 0; i < CONFIG.particles.count; i++) {
      const isBox = Math.random() > 0.5;
      const mesh = new THREE.Mesh(isBox ? boxGeo : sphereGeo, goldMat);
      const s = 0.3 + Math.random() * 0.4;
      mesh.scale.set(s, s, s);
      mainGroupRef.current.add(mesh);
      
      const p = generateParticleObject(mesh, 'GOLD', false);
      // Assign a point from our date matrix if available
      if (i < datePositions.length) {
        p.posDate.copy(datePositions[i]);
      } else {
        // Extra particles scatter during date mode
        p.posDate.copy(p.posScatter).multiplyScalar(1.5);
      }
      particlesRef.current.push(p);
    }

    // Dust particles
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xfff0aa, transparent: true, opacity: 0.5 });
    const dustGeo = new THREE.TetrahedronGeometry(0.1, 0);
    for (let i = 0; i < CONFIG.particles.dustCount; i++) {
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      mainGroupRef.current.add(mesh);
      const p = generateParticleObject(mesh, 'DUST', true);
      p.posDate.copy(p.posScatter).multiplyScalar(2);
      particlesRef.current.push(p);
    }

    // Star on Top
    const starGeo = new THREE.OctahedronGeometry(1.5, 0);
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffeebb, emissive: 0xffaa00, emissiveIntensity: 2.0 });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(0, CONFIG.particles.treeHeight / 2 + 1.5, 0);
    mainGroupRef.current.add(star);
  };

  const generateParticleObject = (mesh: THREE.Object3D, type: string, isDust: boolean): ParticleType => {
    const posTree = new THREE.Vector3();
    const posScatter = new THREE.Vector3();
    const posDate = new THREE.Vector3();
    
    const h = CONFIG.particles.treeHeight;
    let t = Math.pow(Math.random(), 0.85);
    const y = (t * h) - (h / 2);
    let rMax = CONFIG.particles.treeRadius * (1.0 - t);
    if (rMax < 0.8) rMax = 0.8;
    const angle = t * 45 * Math.PI + Math.random() * Math.PI;
    const r = rMax * (0.8 + Math.random() * 0.4);
    posTree.set(Math.cos(angle) * r, y, Math.sin(angle) * r);

    const rScatter = isDust ? (15 + Math.random() * 25) : (10 + Math.random() * 15);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    posScatter.set(
      rScatter * Math.sin(phi) * Math.cos(theta),
      rScatter * Math.sin(phi) * Math.sin(theta),
      rScatter * Math.cos(phi)
    );

    return {
      mesh, type, isDust, posTree, posScatter, posDate,
      baseScale: mesh.scale.x,
      spinSpeed: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)
    };
  };

  const updateRotation = (dt: number) => {
    const target = rotationRef.current;
    if (handData.detected && mode !== AppMode.TREE) {
      target.y += (handData.x * Math.PI * 0.5 - target.y) * 2 * dt;
      target.x += (handData.y * Math.PI * 0.2 - target.x) * 2 * dt;
    } else {
      if (mode === AppMode.TREE) {
        target.y += 0.4 * dt;
        target.x *= 0.95;
      } else if (mode === AppMode.DATE) {
        target.y *= 0.95;
        target.x *= 0.95;
      } else {
        target.y += 0.1 * dt;
      }
    }
    mainGroupRef.current.rotation.y = target.y;
    mainGroupRef.current.rotation.x = target.x;
  };

  const updateParticles = (dt: number) => {
    const focusTarget = particlesRef.current.find(p => p.type === 'PHOTO');
    
    particlesRef.current.forEach(p => {
      let targetPos = p.posTree;
      if (mode === AppMode.SCATTER) targetPos = p.posScatter;
      else if (mode === AppMode.DATE) targetPos = p.posDate;
      else if (mode === AppMode.FOCUS) {
        if (p === focusTarget) {
          const invMatrix = new THREE.Matrix4().copy(mainGroupRef.current.matrixWorld).invert();
          targetPos = new THREE.Vector3(0, 2, 32).applyMatrix4(invMatrix);
        } else {
          targetPos = p.posScatter;
        }
      }

      const lerpSpeed = (mode === AppMode.FOCUS && p === focusTarget) ? 6.0 : 2.5;
      p.mesh.position.lerp(targetPos, lerpSpeed * dt);

      if (mode !== AppMode.DATE) {
        p.mesh.rotation.x += p.spinSpeed.x * dt * 0.5;
        p.mesh.rotation.y += p.spinSpeed.y * dt * 0.5;
      } else {
        p.mesh.rotation.y *= 0.95;
      }

      let s = p.baseScale;
      if (p.isDust) {
        s = p.baseScale * (0.8 + 0.4 * Math.sin(clockRef.current.elapsedTime * 3 + p.mesh.id));
        if (mode === AppMode.TREE) s = 0;
      } else if (mode === AppMode.FOCUS && p === focusTarget) {
        s = 4.5;
      } else if (mode === AppMode.DATE) {
        s = 0.5;
      } else if (mode === AppMode.SCATTER && p.type === 'PHOTO') {
        s = 2.0;
      }
      
      p.mesh.scale.lerp(new THREE.Vector3(s, s, s), 5 * dt);
    });
  };

  useEffect(() => {
    if (images.length > lastProcessedImageCount.current) {
      const newImages = images.slice(lastProcessedImageCount.current);
      newImages.forEach(imgData => {
        new THREE.TextureLoader().load(imgData, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          const frameGeo = new THREE.BoxGeometry(1.4, 1.4, 0.05);
          const frameMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.champagneGold, metalness: 1.0, roughness: 0.1 });
          const frame = new THREE.Mesh(frameGeo, frameMat);
          const photoGeo = new THREE.PlaneGeometry(1.2, 1.2);
          const photoMat = new THREE.MeshBasicMaterial({ map: tex });
          const photo = new THREE.Mesh(photoGeo, photoMat);
          photo.position.z = 0.04;
          const group = new THREE.Group();
          group.add(frame);
          group.add(photo);
          photoGroupRef.current.add(group);
          const p = generateParticleObject(group, 'PHOTO', false);
          p.posDate.copy(p.posScatter).multiplyScalar(1.2);
          particlesRef.current.push(p);
        });
      });
      lastProcessedImageCount.current = images.length;
    }
  }, [images]);

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
};

export default Scene3D;
