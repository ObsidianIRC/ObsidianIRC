import { v4 as uuidv4 } from 'uuid';
import type { Channel, Message, Server, User } from '../types';
import useStore from '../store';
import { parseNamesResponse } from './ircUtils';

class IRCClient {
  private sockets: Map<string, WebSocket> = new Map(); // Map of serverId to WebSocket
  private servers: Map<string, Server> = new Map();
  private currentUser: User | null = null;
  private eventCallbacks: { [event: string]: ((response: any) => void)[] } = {};
  public preventCapEnd: boolean = false;

  connect(
    host: string,
    port: number,
    nickname: string,
    password?: string
  ): Promise<Server> {
    return new Promise((resolve, reject) => {
      const url = `wss://${host}:${port}`;
      const socket = new WebSocket(url);

      socket.onopen = () => {
        // Send IRC commands to register the user
        socket.send(`CAP LS 302`);
        socket.send(`NICK ${nickname}`);
        socket.send(`USER ${nickname} 0 * :${nickname}`);
        if (password) {
          socket.send(`PASS ${password}`);
        }

        const server: Server = {
          id: uuidv4(),
          name: host,
          host,
          port,
          channels: [],
          isConnected: true,
          users: [],
        };

        this.servers.set(server.id, server);
        this.sockets.set(server.id, socket); // Associate the WebSocket with the server
        this.currentUser = {
          id: uuidv4(),
          username: nickname,
          isOnline: true,
          status: 'online',
        };

        socket.onclose = () => {
          console.log(`Disconnected from server ${host}`);
          this.sockets.delete(server.id);
        };

        resolve(server);
      };

      socket.onerror = (error) => {
        reject(new Error(`Failed to connect to ${host}:${port}: ${error}`));
      };
      socket.onmessage = (event) => {
        const serverId = Array.from(this.servers.keys()).find((id) => this.sockets.get(id) === socket);
        if (serverId) {
          const server = this.servers.get(serverId);
          if (server) {
            this.handleMessage(event.data, serverId);
          }
        }
      };
    });
  }

  disconnect(serverId: string): void {
    const socket = this.sockets.get(serverId);
    if (socket) {
      socket.send('QUIT :Client disconnecting');
      socket.close();
      this.sockets.delete(serverId);
    }
    this.servers.delete(serverId);
  }

  sendRaw(serverId: string, command: string): void {
    const socket = this.sockets.get(serverId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(command);
    } else {
      console.error(`Socket for server ${serverId} is not open`);
    }
  }

  joinChannel(serverId: string, channelName: string): Channel {
    const server = this.servers.get(serverId);
    if (server) {
      const existingChannel = server.channels.find((channel) => channel.name === channelName);
      if (existingChannel) {
        return existingChannel;
      }

      this.sendRaw(serverId, `JOIN ${channelName}`);
      this.sendRaw(serverId, `CHATHISTORY LATEST ${channelName} * 100`);
      const channel: Channel = {
        id: uuidv4(),
        name: channelName,
        topic: '',
        isPrivate: false,
        serverId,
        unreadCount: 0,
        isMentioned: false,
        messages: [],
        users: [],
      };
      server.channels.push(channel); // Ensure the channel is added to the server
      return channel;
    }
    throw new Error(`Server with ID ${serverId} not found`);
  }

  leaveChannel(serverId: string, channelName: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      this.sendRaw(serverId, `PART ${channelName}`);
      server.channels = server.channels.filter((channel) => channel.name !== channelName);
    }
  }

  sendMessage(serverId: string, channelId: string, content: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      const channel = server.channels.find((ch) => ch.id === channelId);
      if (channel) {
        this.sendRaw(serverId, `PRIVMSG ${channel.name} :${content}`);
      } else {
        throw new Error(`Channel with ID ${channelId} not found on server ${server.name}`);
      }
    } else {
      throw new Error(`Server with ID ${serverId} not found`);
    }
  }

  markChannelAsRead(serverId: string, channelId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      const channel = server.channels.find((ch) => ch.id === channelId);
      if (channel) {
        channel.unreadCount = 0;
      }
    }
  }

  capAck(serverId: string, capabilities: string): void {
    this.triggerEvent('CAP_ACKNOWLEGED', { serverId, capabilities });
  }

  private handleMessage(data: string, serverId: string): void {
    console.log(`IRC Message from serverId=${serverId}:`, data);

    const lines = data.split('\r\n');
    for (const line of lines) {
      if (line.split(' ')[1] == "PING" || line.split(' ')[0] == "PING") {
        const key = (line.split(' ')[0] == "PING") ? line.split(' ')[1] : line.split(' ')[2];
        this.sendRaw(serverId, `PONG ${key}`);
        console.log(`PONG sent to server ${serverId} with key ${key}`);
      } else if (line.includes(' 001 ')) {
        const match = line.match(/^(?:@[^ ]+ )?:([^ ]+)\s001\s([^ ]+)\s/);
        if (match) {
          const [, serverName, nickname] = match;
          this.triggerEvent('ready', { serverId, serverName, nickname });
        }
      } else if (line.includes('JOIN')) {
        const match = line.match(/^(?:@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ JOIN :?([#&][^\s,\x07]{1,199})$/);
        if (match) {
          const [, username, channelName] = match;
          this.triggerEvent('JOIN', { serverId, username, channelName });
        }
      } else if (line.includes('PART')) {
          const match = line.match(/^(?:@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ PART :?([#&][^\s,\x07]{1,199})$/);        if (match) {
          const [, username, channelName] = match;
          this.triggerEvent('PART', { serverId, username, channelName });
        }
      } else if (line.includes('PRIVMSG')) {
        const match = line.match(/^(?:@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ PRIVMSG ([^ ]+) :(.+)$/);
        if (match) {
          const [, sender, target, message] = match;
          const isChannel = target.startsWith('#');
          const channelName = isChannel ? target : sender;
  
          this.triggerEvent('PRIVMSG', {
            serverId,
            sender,
            channelName,
            message,
            timestamp: new Date(),
          });
        } 
      } else if (line.includes('353')) {
        const match = line.match(/^(?:@[^ ]+ )?:[^ ]+\s353\s[^ ]+\s[=|@|*]\s([^ ]+)\s:(.+)$/);
        if (match) {
          const [, channelName, names] = match;
          const newUsers = parseNamesResponse(names); // Parse the user list
          console.log(`Parsed users for channel ${channelName}:`, newUsers);

          // Find the server and channel
          const server = this.servers.get(serverId);
          if (server) {
            const channel = server.channels.find((c) => c.name === channelName);
            if (channel) {
              // Merge new users with existing users
              const existingUsers = channel.users || [];
              const mergedUsers = [...existingUsers];

              newUsers.forEach((newUser) => {
                if (!existingUsers.some((user) => user.username === newUser.username)) {
                  mergedUsers.push(newUser);
                }
              });

              channel.users = mergedUsers; // Update the channel's user list
              console.log(`Updated user list for channel ${channelName}:`, channel.users);

              // Trigger an event to notify the UI
              this.triggerEvent('NAMES', { serverId, channelName, users: mergedUsers });
            } else {
              console.warn(`Channel ${channelName} not found on server ${serverId}`);
            }
          } else {
            console.warn(`Server ${serverId} not found while processing NAMES response`);
          }
        }
      } else if (line.includes('CAP * LS')) {
        const match = line.match(/^(?:@\S+\s)?:(\S+)\sCAP\s\*\sLS\s(?:\*\s)?:(.+)$/);
        if (match) {
          const [, , caps] = match;
          // Trigger an event to notify the UI
          this.triggerEvent('CAP LS', { serverId: serverId, cliCaps: caps });
        }
      } else if (line.match(/:[^ ]+ CAP (.*) ACK :(.*)/)) {
        const match = line.match(/:[^ ]+ CAP (.*) ACK :(.*)/);
        if (match) {
          const [, , caps] = match;
          // Trigger an event to notify the UI
          this.triggerEvent('CAP ACK', { serverId: serverId, cliCaps: caps });
        }
        else console.log("CAP ACK not matched");
      }
    }
  }

  on(event: string, callback: (response: any) => void): void {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event].push(callback);
  }

  private triggerEvent(event: string, data: any): void {
    if (this.eventCallbacks[event]) {
      this.eventCallbacks[event].forEach((callback) => callback(data));
    }
  }

  getServers(): Server[] {
    return Array.from(this.servers.values());
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }
}

export const ircClient = new IRCClient();
export default ircClient;
