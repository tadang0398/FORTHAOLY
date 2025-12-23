
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Scene3D from './components/Scene3D';
import UIOverlay from './components/UIOverlay';
import { AppMode, HandData } from './types';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.TREE);
  const [images, setImages] = useState<string[]>([]);
  const [uiVisible, setUiVisible] = useState(true);
  const [handData, setHandData] = useState<HandData>({ detected: false, x: 0, y: 0, isHeart: false });
  const [loading, setLoading] = useState(true);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);

  useEffect(() => {
    setIsMobileDevice(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  // Initialize MediaPipe
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2 
        });
        landmarkerRef.current = handLandmarker;

        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener("loadeddata", predict);
          }
        }
      } catch (err) {
        console.error("Failed to init MediaPipe:", err);
      } finally {
        setLoading(false);
      }
    };

    initMediaPipe();
  }, []);

  const predict = useCallback(() => {
    if (!videoRef.current || !landmarkerRef.current) return;
    const startTimeMs = performance.now();
    const results = landmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
    processGestures(results);
    requestAnimationFrame(predict);
  }, []);

  const processGestures = (result: HandLandmarkerResult) => {
    if (result.landmarks && result.landmarks.length > 0) {
      const lm = result.landmarks[0];
      const lm2 = result.landmarks[1]; 
      
      let isHeart = false;
      if (lm && lm2) {
        // Heart Detection: Thumb tips close AND Index tips close
        const distThumbs = Math.hypot(lm[4].x - lm2[4].x, lm[4].y - lm2[4].y);
        const distIndices = Math.hypot(lm[8].x - lm2[8].x, lm[8].y - lm2[8].y);
        // On video 640x480, 0.15 is a reasonable distance for "touching"
        if (distIndices < 0.12 && distThumbs < 0.12) {
          isHeart = true;
        }
      }

      const wrist = lm[0];
      const thumb = lm[4];
      const index = lm[8];
      const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
      const tips = [lm[8], lm[12], lm[16], lm[20]];
      let avgDist = 0;
      tips.forEach(t => avgDist += Math.hypot(t.x - wrist.x, t.y - wrist.y));
      avgDist /= 4;

      setHandData({
        detected: true,
        x: (lm[9].x - 0.5) * 2,
        y: (lm[9].y - 0.5) * 2,
        isHeart
      });

      if (isHeart) {
        setMode(AppMode.DATE);
      } else if (pinchDist < 0.05) {
        setMode(AppMode.FOCUS);
      } else if (avgDist < 0.2) {
        setMode(AppMode.TREE);
      } else if (avgDist > 0.4) {
        setMode(AppMode.SCATTER);
      }
    } else {
      setHandData(prev => ({ ...prev, detected: false, isHeart: false }));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImages(prev => {
            const next = [...prev, event.target!.result as string];
            // Mobile auto-hide logic
            if (isMobileDevice) {
              setUiVisible(false);
            }
            return next;
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') setUiVisible(v => !v);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      <Scene3D 
        mode={mode} 
        images={images} 
        handData={handData} 
      />

      <UIOverlay 
        visible={uiVisible} 
        onUpload={handleImageUpload} 
        mode={mode}
        loading={loading}
        isMobile={isMobileDevice}
      />

      <video 
        ref={videoRef} 
        className="hidden" 
        autoPlay 
        playsInline 
        muted 
      />

      {uiVisible && !loading && (
        <div className="absolute bottom-6 left-6 text-yellow-500/50 text-[10px] tracking-widest uppercase pointer-events-none font-inter">
          <div className="flex flex-col gap-1">
            <span className={mode === AppMode.TREE ? 'text-yellow-400 font-bold' : ''}>• Closed Hand: Tree</span>
            <span className={mode === AppMode.SCATTER ? 'text-yellow-400 font-bold' : ''}>• Open Hand: Scatter</span>
            <span className={mode === AppMode.FOCUS ? 'text-yellow-400 font-bold' : ''}>• Pinch: View Photo</span>
            <span className={mode === AppMode.DATE ? 'text-yellow-400 font-bold' : ''}>• Heart: 23122002</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
