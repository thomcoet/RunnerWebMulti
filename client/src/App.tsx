// src/App.tsx
import React, { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import './App.css';

interface Player {
  id: string;
  x: number;
  y: number;
  score: number;
  isJumping: boolean;
  isSliding: boolean;
}

interface PlayerAction {
  id: string;
  action: {
    type: string;
    value: boolean;
  };
}

interface PlayerUpdate {
  id: string;
  x: number;
  score: number;
}

const SOCKET_SERVER_URL = "http://localhost:3001";

// Constantes pour la physique du saut
const BASE_Y = 350;       // Position de sol
const JUMP_VELOCITY = 10; // Vitesse initiale réduite
const GRAVITY = 0.5;      // Gravité réduite
const MAX_VELOCITY = -10; // Vélocité terminale

const App: React.FC = () => {
  const [players, setPlayers] = useState<{ [key: string]: Player }>({});
  const socketRef = useRef<Socket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Ref pour suivre si une animation de saut est en cours pour chaque joueur
  const isAnimatingJumpRef = useRef<{ [key: string]: boolean }>({});
  // Ref pour suivre la vélocité de chaque joueur
  const velocityRef = useRef<{ [key: string]: number }>({});

  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);
    
    // Recevoir l'état actuel des joueurs
    socketRef.current.on('currentPlayers', (currentPlayers: { [key: string]: Player }) => {
      setPlayers(currentPlayers);
      // Initialiser la vélocité pour chaque joueur
      Object.keys(currentPlayers).forEach(id => {
        velocityRef.current[id] = 0;
      });
    });
    
    // Un nouveau joueur s'est connecté
    socketRef.current.on('newPlayer', (player: Player) => {
      setPlayers(prev => ({ ...prev, [player.id]: player }));
      velocityRef.current[player.id] = 0;
    });
    
    // Mise à jour des joueurs
    socketRef.current.on('playerUpdate', (update: PlayerUpdate) => {
      setPlayers(prev => {
        const player = prev[update.id];
        if (player) {
          return { 
            ...prev, 
            [update.id]: { 
              ...player, 
              x: update.x, 
              score: update.score 
            } 
          };
        }
        return prev;
      });
    });

    // Actions des joueurs
    socketRef.current.on('playerAction', (data: PlayerAction) => {
      console.log(`Action received from ${data.id}:`, data.action);
      setPlayers(prev => {
        const player = prev[data.id];
        if (player) {
          return { 
            ...prev, 
            [data.id]: { 
              ...player, 
              [`is${data.action.type.charAt(0).toUpperCase() + data.action.type.slice(1)}`]: data.action.value 
            } 
          };
        }
        return prev;
      });

      // Si l'action est 'jump' et que la valeur est true, démarrer l'animation de saut
      if (data.action.type === 'jump' && data.action.value) {
        if (!isAnimatingJumpRef.current[data.id]) {
          isAnimatingJumpRef.current[data.id] = true;
          velocityRef.current[data.id] = JUMP_VELOCITY;
          animateJump(data.id);
        }
      }
    });
    
    // Un joueur s'est déconnecté
    socketRef.current.on('playerDisconnected', (id: string) => {
      setPlayers(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      // Nettoyer les refs
      delete isAnimatingJumpRef.current[id];
      delete velocityRef.current[id];
    });
    
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Gestion des entrées clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const playerId = socketRef.current?.id || '';
      if (!playerId) return;

      let actionType: string | null = null;

      switch(e.code) {
        case 'Space':
          actionType = 'jump';
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          actionType = 'slide';
          break;
        default:
          break;
      }

      if (actionType) {
        const type = actionType; // Variable locale de type `string`
        
        console.log(`KeyDown detected: ${type}`);

        // Envoyer l'action au serveur
        socketRef.current?.emit('playerAction', { type, value: true });
        
        // Mettre à jour localement l'état du joueur
        setPlayers(prev => {
          const updatedPlayer = { 
            ...prev[playerId], 
            [`is${type.charAt(0).toUpperCase() + type.slice(1)}`]: true 
          };
          return { ...prev, [playerId]: updatedPlayer };
        });

        // Si l'action est 'jump', démarrer l'animation de saut
        if (type === 'jump' && !isAnimatingJumpRef.current[playerId]) {
          isAnimatingJumpRef.current[playerId] = true;
          velocityRef.current[playerId] = JUMP_VELOCITY;
          animateJump(playerId);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const playerId = socketRef.current?.id || '';
      if (!playerId) return;

      let actionType: string | null = null;

      switch(e.code) {
        case 'Space':
          actionType = 'jump';
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          actionType = 'slide';
          break;
        default:
          break;
      }

      if (actionType) {
        const type = actionType; // Variable locale de type `string`

        console.log(`KeyUp detected: ${type}`);

        // Envoyer l'action au serveur
        socketRef.current?.emit('playerAction', { type, value: false });
        
        // Mettre à jour localement l'état du joueur
        setPlayers(prev => {
          const updatedPlayer = { 
            ...prev[playerId], 
            [`is${type.charAt(0).toUpperCase() + type.slice(1)}`]: false 
          };
          return { ...prev, [playerId]: updatedPlayer };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [players]);

  // Fonction pour animer le saut
  const animateJump = (id: string) => {
    const jumpStep = () => {
      setPlayers(prev => {
        const currentPlayer = prev[id];
        if (!currentPlayer) return prev;

        let newY = currentPlayer.y - velocityRef.current[id];
        let newVelocity = velocityRef.current[id] - GRAVITY;

        // Limiter la vélocité
        if (newVelocity < MAX_VELOCITY) {
          newVelocity = MAX_VELOCITY;
        }
        velocityRef.current[id] = newVelocity;

        // Si le joueur atteint le sol
        if (newY >= BASE_Y) {
          newY = BASE_Y;
          isAnimatingJumpRef.current[id] = false;
          velocityRef.current[id] = 0;
          return { 
            ...prev, 
            [id]: { 
              ...currentPlayer, 
              y: newY, 
              isJumping: false 
            } 
          };
        }

        return { 
          ...prev, 
          [id]: { 
            ...currentPlayer, 
            y: newY 
          } 
        };
      });

      // Continuer l'animation tant que le joueur n'a pas atteint le sol
      const currentVelocity = velocityRef.current[id];
      if (currentVelocity !== 0 || players[id]?.y < BASE_Y) {
        requestAnimationFrame(jumpStep);
      }
    };

    requestAnimationFrame(jumpStep);
  };

  // Rendu du canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      Object.values(players).forEach(player => {
        ctx.fillStyle = player.id === socketRef.current?.id ? 'blue' : 'red';

        // Utiliser la position y du joueur
        let height = 50;
        let y = player.y;
        if (player.isSliding) {
          height = 30;
          console.log(`Player ${player.id} is sliding.`);
        }
        // Ne pas ajuster y ici pour une meilleure gestion via l'animation
        if (player.isJumping) {
          console.log(`Player ${player.id} is jumping.`);
        }

        ctx.fillRect(player.x, y, 50, height);
      });
    }
  }, [players]);

  // Simuler la progression du joueur local
  useEffect(() => {
    const interval = setInterval(() => {
      const playerId = socketRef.current?.id || '';
      const player = players[playerId];
      if (player) {
        const updatedPlayer = { 
          x: player.x + 5, 
          score: player.score + 1 
        };
        socketRef.current?.emit('playerUpdate', updatedPlayer);
        setPlayers(prev => ({ 
          ...prev, 
          [player.id]: { 
            ...prev[player.id], 
            x: updatedPlayer.x, 
            score: updatedPlayer.score 
          } 
        }));
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [players]);

  return (
    <div className="App">
      <h1>Multiplayer Runner</h1>
      <canvas ref={canvasRef} width={800} height={400} style={{ border: '1px solid black' }} />
      <div className="scoreboard">
        {Object.values(players).map(player => (
          <div key={player.id} style={{ color: player.id === socketRef.current?.id ? 'blue' : 'red' }}>
            Player {player.id.substring(0, 5)}: {player.score}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
