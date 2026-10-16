import http from 'http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { registerMeetingHandlers } from './core/meetingSocket.js';

const port = Number(process.env.PORT) || 4000;
const server = http.createServer(app);

export const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN, credentials: true },
});

registerMeetingHandlers(io);

server.listen(port, () => {
  console.log(`Bastion Academy backend listening on :${port}`);
});
