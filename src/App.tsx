/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, RotateCcw, Trophy, Zap } from "lucide-react";

// --- Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 320;
const PLAYER_X = 100;
const PLAYER_SIZE = 40;
const GRAVITY = 0.8;
const JUMP_FORCE = -15;
const INITIAL_SPEED = 5;
const SPEED_INCREMENT = 0.001;
const OBSTACLE_MIN_GAP = 300;
const OBSTACLE_MAX_GAP = 600;

// --- Sound Engine ---
class SoundEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playJump() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playGameOver() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  playScore() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
}

const sounds = new SoundEngine();

// --- Game Logic ---

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: "box" | "spike";
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"START" | "PLAYING" | "GAMEOVER">("START");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem("neon-dash-highscore");
    return saved ? parseInt(saved, 10) : 0;
  });

  // Game state refs for the loop
  const gameRef = useRef({
    playerY: GROUND_Y - PLAYER_SIZE,
    playerVY: 0,
    isJumping: false,
    obstacles: [] as Obstacle[],
    particles: [] as Particle[],
    speed: INITIAL_SPEED,
    distance: 0,
    lastObstacleX: CANVAS_WIDTH,
    frame: 0,
    bgOffset: 0,
    midOffset: 0,
  });

  const resetGame = useCallback(() => {
    gameRef.current = {
      playerY: GROUND_Y - PLAYER_SIZE,
      playerVY: 0,
      isJumping: false,
      obstacles: [],
      particles: [],
      speed: INITIAL_SPEED,
      distance: 0,
      lastObstacleX: CANVAS_WIDTH,
      frame: 0,
      bgOffset: 0,
      midOffset: 0,
    };
    setScore(0);
    setGameState("PLAYING");
  }, []);

  const jump = useCallback(() => {
    if (gameState !== "PLAYING") return;
    if (!gameRef.current.isJumping) {
      gameRef.current.playerVY = JUMP_FORCE;
      gameRef.current.isJumping = true;
      sounds.playJump();
    }
  }, [gameState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (gameState === "START" || gameState === "GAMEOVER") {
          resetGame();
        } else {
          jump();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, jump, resetGame]);

  useEffect(() => {
    if (gameState !== "PLAYING") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const loop = () => {
      const g = gameRef.current;
      g.frame++;

      // Update Physics
      g.playerVY += GRAVITY;
      g.playerY += g.playerVY;

      if (g.playerY > GROUND_Y - PLAYER_SIZE) {
        g.playerY = GROUND_Y - PLAYER_SIZE;
        g.playerVY = 0;
        g.isJumping = false;
      }

      // Update Speed
      g.speed += SPEED_INCREMENT;
      g.distance += g.speed;
      g.bgOffset += g.speed * 0.1;
      g.midOffset += g.speed * 0.3;

      const currentScore = Math.floor(g.distance / 100);
      if (currentScore > score) {
        setScore(currentScore);
        if (currentScore % 10 === 0) sounds.playScore();
      }

      // Update Obstacles
      if (CANVAS_WIDTH - g.lastObstacleX > OBSTACLE_MIN_GAP + Math.random() * OBSTACLE_MAX_GAP) {
        const type = Math.random() > 0.7 ? "spike" : "box";
        g.obstacles.push({
          x: CANVAS_WIDTH,
          width: 30 + Math.random() * 20,
          height: type === "spike" ? 40 : 30 + Math.random() * 30,
          type,
        });
        g.lastObstacleX = CANVAS_WIDTH;
      }

      g.obstacles.forEach((obs, index) => {
        obs.x -= g.speed;
        if (obs.x + obs.width < 0) {
          g.obstacles.splice(index, 1);
        }

        // Collision Detection
        const margin = 10;
        if (
          PLAYER_X + PLAYER_SIZE - margin > obs.x &&
          PLAYER_X + margin < obs.x + obs.width &&
          g.playerY + PLAYER_SIZE - margin > GROUND_Y - obs.height
        ) {
          setGameState("GAMEOVER");
          sounds.playGameOver();
          if (currentScore > highScore) {
            setHighScore(currentScore);
            localStorage.setItem("neon-dash-highscore", currentScore.toString());
          }
        }
      });
      g.lastObstacleX -= g.speed;

      // Particles
      if (g.frame % 2 === 0 && !g.isJumping) {
        g.particles.push({
          x: PLAYER_X + 10,
          y: GROUND_Y,
          vx: -Math.random() * 2,
          vy: -Math.random() * 2,
          life: 1,
          color: "#00f2ff",
        });
      }

      g.particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) g.particles.splice(i, 1);
      });

      // --- Rendering ---
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. Far Background (Mountains)
      ctx.fillStyle = "#0a0a15";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = "#151525";
      for (let i = 0; i < 5; i++) {
        const x = (i * 300 - (g.bgOffset % 300));
        ctx.beginPath();
        ctx.moveTo(x - 150, GROUND_Y);
        ctx.lineTo(x, 100);
        ctx.lineTo(x + 150, GROUND_Y);
        ctx.fill();
      }

      // 2. Mid Background (Cyber Trees)
      ctx.strokeStyle = "rgba(0, 242, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const x = (i * 150 - (g.midOffset % 150));
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y);
        ctx.lineTo(x, GROUND_Y - 80);
        ctx.moveTo(x - 20, GROUND_Y - 60);
        ctx.lineTo(x + 20, GROUND_Y - 60);
        ctx.stroke();
        
        // Glow on trees
        ctx.fillStyle = "rgba(0, 242, 255, 0.1)";
        ctx.beginPath();
        ctx.arc(x, GROUND_Y - 80, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Ground & Grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      for (let i = 0; i < 20; i++) {
        const x = (i * 50 - (g.distance % 50)) % CANVAS_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y);
        ctx.lineTo(x - 100, CANVAS_HEIGHT);
        ctx.stroke();
      }

      // 4. Particles
      g.particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, 3, 3);
      });
      ctx.globalAlpha = 1;

      // 5. Obstacles
      g.obstacles.forEach((obs) => {
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ff007a";
        ctx.fillStyle = "#ff007a";
        if (obs.type === "spike") {
          ctx.beginPath();
          ctx.moveTo(obs.x, GROUND_Y);
          ctx.lineTo(obs.x + obs.width / 2, GROUND_Y - obs.height);
          ctx.lineTo(obs.x + obs.width, GROUND_Y);
          ctx.fill();
        } else {
          ctx.fillRect(obs.x, GROUND_Y - obs.height, obs.width, obs.height);
        }
        ctx.shadowBlur = 0;
      });

      // 6. Player (Neon Fox)
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#00f2ff";
      ctx.fillStyle = "#00f2ff";
      
      ctx.save();
      const bob = Math.sin(g.frame * 0.2) * 2;
      ctx.translate(PLAYER_X, g.playerY + bob);
      
      if (g.isJumping) {
        ctx.rotate(g.playerVY * 0.05);
      }

      // Body
      ctx.fillRect(0, 10, 40, 20);
      
      // Head
      ctx.beginPath();
      ctx.moveTo(35, 10);
      ctx.lineTo(55, 5);
      ctx.lineTo(55, 25);
      ctx.fill();
      
      // Ears
      ctx.beginPath();
      ctx.moveTo(40, 5);
      ctx.lineTo(45, -5);
      ctx.lineTo(50, 5);
      ctx.fill();
      
      // Tail (Wagging)
      ctx.save();
      ctx.translate(0, 20);
      const wag = Math.sin(g.frame * 0.3) * 0.5;
      ctx.rotate(wag - 0.5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-25, -10);
      ctx.lineTo(-20, 10);
      ctx.fill();
      ctx.restore();
      
      // Eyes
      ctx.fillStyle = "#000";
      ctx.fillRect(48, 8, 4, 4);
      
      ctx.restore();
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, score, highScore]);

  return (
    <div className="min-h-screen bg-bg-deep text-white font-main flex flex-col items-center justify-center p-4 overflow-hidden select-none">
      {/* Header */}
      <div className="w-full max-w-[800px] flex justify-between items-end mb-6 px-2">
        <div>
          <h1 className="text-5xl font-black tracking-tighter italic uppercase flex items-center gap-2 bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(0,242,255,0.5)]">
            Neon Dash
          </h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-neon-blue/60 font-mono mt-1">Immersive Protocol v2.0</p>
        </div>
        <div className="bg-glass backdrop-blur-md border border-glass-border p-3 px-6 rounded-xl shadow-2xl">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neon-blue mb-1">High Score</div>
          <div className="text-2xl font-mono font-extrabold">{highScore.toString().padStart(6, "0")}</div>
        </div>
      </div>

      {/* Game Container */}
      <div className="relative group" onClick={jump}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="rounded-2xl border border-glass-border shadow-[0_0_60px_rgba(0,0,0,0.8)] cursor-pointer"
          id="game-canvas"
        />

        {/* Score Overlay */}
        <div className="absolute top-8 left-8 pointer-events-none bg-glass backdrop-blur-md border border-glass-border p-4 px-8 rounded-xl shadow-xl">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neon-blue mb-1">Distance</div>
          <div className="text-4xl font-mono font-extrabold">
            {score.toString().padStart(6, "0")}
          </div>
        </div>

        {/* UI Overlays */}
        <AnimatePresence>
          {gameState === "START" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-bg-deep/85 backdrop-blur-lg flex flex-col items-center justify-center rounded-2xl z-50"
            >
              <motion.div
                animate={{ y: [0, -15, 0], filter: ["drop-shadow(0 0 5px #00f2ff)", "drop-shadow(0 0 20px #00f2ff)", "drop-shadow(0 0 5px #00f2ff)"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mb-10"
              >
                <Zap size={100} className="text-neon-blue fill-neon-blue" />
              </motion.div>
              <h2 className="text-7xl font-black italic uppercase mb-4 tracking-tighter bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(0,242,255,0.4)]">
                NEON DASH
              </h2>
              <p className="text-white/50 mb-10 uppercase tracking-[0.3em] text-sm">SPACE TO JUMP • TAP TO START</p>
              <button
                onClick={(e) => { e.stopPropagation(); resetGame(); }}
                className="px-16 py-5 bg-neon-blue text-bg-deep font-black uppercase tracking-widest italic hover:scale-110 transition-all duration-300 flex items-center gap-3 rounded-sm shadow-[0_0_40px_rgba(0,242,255,0.4)]"
              >
                <Play fill="currentColor" size={24} /> Initiate Run
              </button>
            </motion.div>
          )}

          {gameState === "GAMEOVER" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-bg-deep/90 backdrop-blur-xl flex flex-col items-center justify-center rounded-2xl z-50 border-2 border-neon-pink/30"
            >
              <h2 className="text-8xl font-black italic uppercase mb-4 tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,0,122,0.6)]">
                TERMINATED
              </h2>
              <div className="flex gap-16 mb-12 mt-6">
                <div className="text-center bg-glass border border-glass-border p-6 px-10 rounded-xl">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neon-pink mb-2">Final Score</div>
                  <div className="text-5xl font-mono font-extrabold">{score}</div>
                </div>
                <div className="text-center bg-glass border border-glass-border p-6 px-10 rounded-xl">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neon-blue mb-2">Best Run</div>
                  <div className="text-5xl font-mono font-extrabold">{highScore}</div>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); resetGame(); }}
                className="px-16 py-5 bg-neon-blue text-bg-deep font-black uppercase tracking-widest italic hover:scale-110 transition-all duration-300 flex items-center gap-3 rounded-sm shadow-[0_0_40px_rgba(0,242,255,0.4)]"
              >
                <RotateCcw size={24} /> System Reboot
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls Info */}
      <div className="mt-10 flex gap-12 text-[11px] uppercase tracking-[0.4em] text-white/30 font-mono">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 border border-gray-800 rounded">Space</span>
          <span>Jump</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 border border-gray-800 rounded">Tap</span>
          <span>Jump</span>
        </div>
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-yellow-500" />
          <span>Beat your best</span>
        </div>
      </div>

      {/* Aesthetic Accents */}
      <div className="fixed bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00f2ff] to-transparent opacity-20" />
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#ff0055] to-transparent opacity-20" />
    </div>
  );
}
