import type { ParsedMessage } from "../protocol/messageParser";
import { getTimestampFromTags } from "../utils/ircUtils";
import { BaseHandler } from "./baseHandler";

/**
 * Handles BATCH command
 */
export class BatchHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const batchRef = msg.params[0];
    const isStart = batchRef.startsWith("+");
    const batchId = batchRef.substring(1); // Remove + or -

    if (isStart) {
      const batchType = msg.params[1];
      const parameters = msg.params.slice(2);

      this.stateManager.startBatch(
        serverId,
        batchId,
        batchType,
        parameters,
        msg.tags?.msgid,
        msg.tags?.time ? new Date(msg.tags.time) : undefined,
      );

      this.emit("BATCH_START", {
        serverId,
        batchId,
        type: batchType,
        parameters,
      });
    } else {
      // Process completed batch
      const batch = this.stateManager.endBatch(serverId, batchId);

      if (
        batch &&
        (batch.type === "multiline" || batch.type === "draft/multiline")
      ) {
        // Handle completed multiline batch
        const target =
          batch.parameters && batch.parameters.length > 0
            ? batch.parameters[0]
            : "";
        const sender = batch.sender || "unknown";

        // Combine messages, handling draft/multiline-concat tags
        let combinedMessage = "";
        batch.messages.forEach((message, index) => {
          const wasConcat = batch.concatFlags?.[index];

          if (index === 0) {
            combinedMessage = message;
          } else {
            if (wasConcat) {
              // Concatenate directly without separator
              combinedMessage += message;
            } else {
              // Join with newline (normal multiline)
              combinedMessage += `\n${message}`;
            }
          }
        });

        this.emit("MULTILINE_MESSAGE", {
          serverId,
          mtags: batch.batchMsgId ? { msgid: batch.batchMsgId } : undefined,
          sender,
          channelName: target.startsWith("#") ? target : undefined,
          message: combinedMessage,
          lines: batch.messages,
          messageIds: batch.messageIds || [],
          timestamp:
            batch.batchTime ||
            (batch.timestamps && batch.timestamps.length > 0
              ? new Date(Math.min(...batch.timestamps.map((t) => t.getTime())))
              : getTimestampFromTags(msg.tags)),
        });
      }

      this.emit("BATCH_END", {
        serverId,
        batchId,
      });
    }
  }
}
