import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useState } from "react";
import BaseModal from "../../lib/modal/BaseModal";
import {
  Button,
  Input,
  ModalBody,
  ModalFooter,
} from "../../lib/modal/components";

export type ModerationAction = "warn" | "kick" | "ban-nick" | "ban-hostmask";

interface ModerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (action: ModerationAction, reason: string) => void;
  username: string;
  action: ModerationAction;
}

const ModerationModal: React.FC<ModerationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  username,
  action,
}) => {
  const { t } = useLingui();
  const [reason, setReason] = useState("");

  const getActionTitle = (action: ModerationAction): string => {
    switch (action) {
      case "warn":
        return t`Warn User`;
      case "kick":
        return t`Kick User`;
      case "ban-nick":
        return t`Ban User (by Nickname)`;
      case "ban-hostmask":
        return t`Ban User (by Hostmask)`;
      default:
        return t`Moderate User`;
    }
  };

  const getActionDescription = (action: ModerationAction): string => {
    switch (action) {
      case "warn":
        return t`Send a warning message to ${username}`;
      case "kick":
        return t`Remove ${username} from the channel`;
      case "ban-nick":
        return t`Ban ${username} by nickname (prevents them from rejoining with the same nick)`;
      case "ban-hostmask":
        return t`Ban ${username} by hostmask (prevents them from rejoining from the same IP/host)`;
      default:
        return "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = reason.trim() || "no reason";
    onConfirm(action, finalReason);
    setReason("");
    onClose();
  };

  const handleClose = () => {
    setReason("");
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={getActionTitle(action)}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="space-y-4">
            <Input type="text" label={t`Username`} value={username} disabled />

            <Input
              type="text"
              label={t`Action`}
              value={getActionDescription(action)}
              disabled
              className="text-sm"
            />

            <Input
              type="text"
              label={t`Reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t`Enter reason (optional)`}
              helperText={t`Will default to 'no reason' if left empty`}
              autoFocus
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={handleClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            type="submit"
            variant={action === "warn" ? "primary" : "danger"}
            className="flex-1"
          >
            {getActionTitle(action)}
          </Button>
        </ModalFooter>
      </form>
    </BaseModal>
  );
};

export default ModerationModal;
