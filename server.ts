// server.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

interface Player {
  id: string;
  x: number;
  y: number;
  score: number;
  isJumping: boolean;
  isSliding: boolean;
}

const BASE_Y = 350; // Position de sol

const players: { [key: string]: Player } = {};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  players[socket.id] = { 
    id: socket.id, 
    x: 0, 
    y: BASE_Y, // Position de sol initiale
    score: 0,
    isJumping: false,
    isSliding: false
  };
  
  // Envoyer l'état actuel des joueurs au nouveau joueur
  socket.emit('currentPlayers', players);
  
  // Inform other players about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Recevoir les actions des joueurs
  socket.on('playerAction', (action: { type: string; value: boolean }) => {
    if (players[socket.id]) {
      console.log(`Action received from ${socket.id}:`, action);
      switch(action.type) {
        case 'jump':
          players[socket.id].isJumping = action.value;
          break;
        case 'slide':
          players[socket.id].isSliding = action.value;
          break;
        default:
          break;
      }
      // Diffuser l'action à tous les autres clients
      io.emit('playerAction', { id: socket.id, action });
    }
  });
  
  // Recevoir les mises à jour des joueurs
  socket.on('playerUpdate', (data: Player) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...data };
      socket.broadcast.emit('playerUpdate', players[socket.id]);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
