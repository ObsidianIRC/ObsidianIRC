import os
import re
import socket
import time


def main():
    HOST = os.environ["HOST"]  # IRC server hostname
    PORT = int(os.environ["PORT"])  # IRC server port
    CHANNEL = os.environ.get("CHANNEL", "#test")
    NICK = os.environ.get("NICK", "EchoBot")

    def send(msg: str):
        irc.send((msg + "\r\n").encode("utf-8"))

    # Create and connect the socket
    irc = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    irc.connect((HOST, PORT))

    send(f"NICK {NICK}")
    send(f"USER {NICK} 0 * :{NICK}")
    send(f"JOIN {CHANNEL}")

    while True:
        data = irc.recv(4096).decode("utf-8", errors="ignore")
        for line in data.split("\r\n"):
            if not line:
                continue
            print("> " + line)

            # Respond to server PINGs to stay connected
            if line.startswith("PING"):
                send("PONG " + line.split()[1])
                continue

            if "PRIVMSG" in line:
                prefix, command, target, *msg_parts = line.split(" ")
                sender = prefix.split("!")[0][1:]
                message = " ".join(msg_parts)[1:]

                if sender != NICK:
                    # Check if bot is mentioned using word boundary or at start with colon
                    nick_mentioned = re.search(rf"\b{re.escape(NICK)}\b", message, re.IGNORECASE) or re.match(
                        rf"^{re.escape(NICK)}:\s+", message, re.IGNORECASE
                    )
                    print(f"Message from {sender} in {target}: {message}")

                    if target == NICK:
                        # Private message
                        send(f"@+typing=active TAGMSG {sender}")
                        time.sleep(2)
                        send(f"PRIVMSG {sender} :You said: {message}")

                    elif nick_mentioned:
                        send(f"@+typing=active TAGMSG {target}")
                        time.sleep(2)  # Simulate typing delay
                        send(f"PRIVMSG {target} :{sender}: I heard you mention me! You said: {message}")


if __name__ == "__main__":
    main()
