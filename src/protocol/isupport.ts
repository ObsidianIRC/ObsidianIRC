import type { IRCClient } from "../lib/ircClient";
import type AppState from "../store/";
import type { ISupportEvent, Server } from "../types/";

export function registerISupportHandler(
  ircClient: IRCClient,
  useStore: typeof AppState,
) {
  ircClient.on("ISUPPORT", ({ serverId, capabilities }: ISupportEvent) => {
    // const paramsArray = capabilities;
    // console.log(capabilities);

    // for (let i = 0; i < paramsArray.length; i++) {
    //   /* Favicon checking */
    //   if (paramsArray[i].startsWith("FAVICON=")) {
    //     const favicon = paramsArray[i].substring(8);
    //     useStore.setState((state: AppState) => {
    //       const updatedServers = state.servers.map((server: Server) => {
    //         if (server.id === serverId) {
    //           return { ...server, icon: favicon };
    //         }
    //         return server;
    //       });
    //       return { servers: updatedServers };
    //     });
    //   }
    // }
  });
}
