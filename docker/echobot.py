import os
import socket


def main():
    HOST = os.environ['HOST']            # IRC server hostname
    PORT = int(os.environ['PORT'])       # IRC server port
    CHANNEL = os.environ.get('CHANNEL', '#test')
    NICK = os.environ.get('NICK', 'EchoBot')

    def send(msg: str):
        irc.send((msg + '\r\n').encode('utf-8'))

    # Create and connect the socket
    irc = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    irc.connect((HOST, PORT))

    send(f"NICK {NICK}")
    send(f"USER {NICK} 0 * :{NICK}")
    send(f"JOIN {CHANNEL}")

    while True:
        data = irc.recv(4096).decode('utf-8', errors='ignore')
        for line in data.split('\r\n'):
            if not line:
                continue
            print('> ' + line)

            # Respond to server PINGs to stay connected
            if line.startswith('PING'):
                send('PONG ' + line.split()[1])
                continue

            if 'PRIVMSG' in line:
                prefix, command, target, *msg_parts = line.split(' ')
                sender = prefix.split('!')[0][1:]
                message = ' '.join(msg_parts)[1:]

                # Only echo messages sent by other users to the joined channel
                if sender != NICK and target == CHANNEL:
                    send(f"PRIVMSG {CHANNEL} :{message}")


if __name__ == '__main__':
    main()
