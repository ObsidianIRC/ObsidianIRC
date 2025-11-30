import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaPlus, FaSpinner, FaTimes, FaTrash } from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";

interface FloodRule {
  amount: number;
  type: "c" | "j" | "k" | "m" | "n" | "t" | "r";
  action?: string;
  time?: number; // in minutes
}

interface FloodSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    floodProfile: string,
    floodRules: FloodRule[],
    seconds: number,
  ) => void;
  initialFloodProfile: string;
  initialFloodParams: string;
}

const FloodSettingsModal: React.FC<FloodSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialFloodProfile,
  initialFloodParams,
}) => {
  const [floodProfile, setFloodProfile] = useState(initialFloodProfile);
  const [floodRules, setFloodRules] = useState<FloodRule[]>([]);
  const [seconds, setSeconds] = useState(60);
  const [isSaving, setIsSaving] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const parseFloodRule = useCallback((ruleStr: string): FloodRule | null => {
    // Format: <amount><type>{#<action>}
    const match = ruleStr.match(/^(\d+)([cjkemntr])(?:#([^#]+))?/);
    if (!match) return null;

    const [, amountStr, type, actionPart] = match;
    const amount = Number.parseInt(amountStr, 10);

    let action: string | undefined;
    let time: number | undefined;

    if (actionPart) {
      // Parse action and optional time: action or action:time
      const actionMatch = actionPart.match(/^([^:]+)(?::(\d+))?/);
      if (actionMatch) {
        action = actionMatch[1];
        if (actionMatch[2]) {
          time = Number.parseInt(actionMatch[2], 10);
        }
      }
    }

    return { amount, type: type as FloodRule["type"], action, time };
  }, []);

  const parseFloodParams = useCallback(
    (params: string) => {
      try {
        // Parse format: [<amount><type>{#<action>}{,...}]:<seconds>
        const colonIndex = params.lastIndexOf(":");
        if (colonIndex === -1) return;

        const rulesPart = params.substring(0, colonIndex);
        const secondsPart = params.substring(colonIndex + 1);

        // Parse seconds
        const parsedSeconds = Number.parseInt(secondsPart, 10);
        if (!Number.isNaN(parsedSeconds)) {
          setSeconds(parsedSeconds);
        }

        // Parse rules
        if (rulesPart.startsWith("[") && rulesPart.endsWith("]")) {
          const rulesStr = rulesPart.substring(1, rulesPart.length - 1);
          const ruleStrings = rulesStr.split(",");

          const parsedRules: FloodRule[] = [];
          for (const ruleStr of ruleStrings) {
            const rule = parseFloodRule(ruleStr.trim());
            if (rule) {
              parsedRules.push(rule);
            }
          }
          setFloodRules(parsedRules);
        }
      } catch (error) {
        console.error("Failed to parse flood parameters:", error);
      }
    },
    [parseFloodRule],
  );

  // Parse initial flood parameters
  useEffect(() => {
    if (initialFloodParams && initialFloodParams !== "Default") {
      parseFloodParams(initialFloodParams);
    }
  }, [initialFloodParams, parseFloodParams]);

  const addFloodRule = () => {
    setFloodRules([...floodRules, { amount: 5, type: "m" }]);
    // Scroll to bottom after adding rule
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop =
          scrollContainerRef.current.scrollHeight;
      }
    }, 0);
  };

  const updateFloodRule = (index: number, updates: Partial<FloodRule>) => {
    const newRules = [...floodRules];
    newRules[index] = { ...newRules[index], ...updates };
    setFloodRules(newRules);
  };

  const removeFloodRule = (index: number) => {
    setFloodRules(floodRules.filter((_, i) => i !== index));
  };

  const getTypeDescription = (type: FloodRule["type"]): string => {
    const descriptions = {
      c: "CTCP",
      j: "Join",
      k: "Knock",
      m: "Messages (channel-wide)",
      n: "Nickchange",
      t: "Text (per-user)",
      r: "Repeat",
    };
    return descriptions[type];
  };

  const getDefaultAction = (type: FloodRule["type"]): string => {
    const defaults = {
      c: "C",
      j: "i",
      k: "K",
      m: "m",
      n: "N",
      t: "kick",
      r: "kick",
    };
    return defaults[type];
  };

  const getAvailableActions = (type: FloodRule["type"]): string[] => {
    const actions = {
      c: ["C", "m", "M"],
      j: ["i", "R"],
      k: ["K"],
      m: ["m", "M"],
      n: ["N"],
      t: ["kick", "b", "d"],
      r: ["kick", "d", "b"],
    };
    return actions[type];
  };

  const formatFloodParams = (): string => {
    if (floodRules.length === 0) return "";

    const ruleStrings = floodRules.map((rule) => {
      let ruleStr = `${rule.amount}${rule.type}`;
      if (rule.action && rule.action !== getDefaultAction(rule.type)) {
        ruleStr += `#${rule.action}`;
        if (rule.time) {
          ruleStr += `:${rule.time}`;
        }
      }
      return ruleStr;
    });

    return `[${ruleStrings.join(",")}]:${seconds}`;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(floodProfile, floodRules, seconds);
      onClose();
    } catch (error) {
      console.error("Failed to save flood settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Common flood profiles based on UnrealIRCd documentation
  const floodProfiles = [
    { value: "", label: "Default (no profile)" },
    { value: "normal", label: "Normal - Standard protection" },
    { value: "strict", label: "Strict - More aggressive protection" },
    { value: "wide", label: "Wide - Broader protection scope" },
    { value: "relaxed", label: "Relaxed - Less aggressive protection" },
  ];

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div
        className={`bg-discord-dark-400 rounded-lg shadow-xl max-h-[90vh] flex flex-col ${isMobile ? "w-full max-w-md" : "w-full max-w-2xl"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-discord-dark-500 flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">
            Flood Protection Settings
          </h2>
          <button
            onClick={onClose}
            className="text-discord-text-muted hover:text-white"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0"
          ref={scrollContainerRef}
        >
          {/* Flood Profile Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-medium text-white mb-2">
                Flood Profile (+F)
              </h3>
              <p className="text-sm text-discord-text-muted mb-4">
                Choose a predefined flood protection profile. These profiles
                provide balanced protection settings for different use cases.
                <a
                  href="https://www.unrealircd.org/docs/Channel_anti-flood_settings#flood-profiles"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-discord-blue hover:underline ml-1"
                >
                  Learn more about profiles →
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white block">
                Profile
              </label>
              <select
                value={floodProfile}
                onChange={(e) => setFloodProfile(e.target.value)}
                className="w-full px-3 py-2 bg-discord-darker border border-discord-border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-discord-blue focus:border-transparent"
              >
                {floodProfiles.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Flood Rules Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-medium text-white mb-2">
                Custom Flood Rules (+f)
              </h3>
              <p className="text-sm text-discord-text-muted mb-4">
                Configure detailed flood protection rules. Each rule specifies
                what type of activity to monitor and what action to take when
                thresholds are exceeded.
                <a
                  href="https://www.unrealircd.org/docs/Channel_anti-flood_settings#Channel_mode_f"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-discord-blue hover:underline ml-1"
                >
                  Learn more about custom rules →
                </a>
              </p>
            </div>

            {/* Global Settings */}
            <div className="p-4 bg-discord-dark rounded-lg">
              <label className="text-sm font-medium text-white block mb-2">
                Time Window (seconds)
              </label>
              <p className="text-xs text-discord-text-muted mb-3">
                How many seconds to monitor for flood activity before resetting
                counters
              </p>
              <input
                type="number"
                value={seconds}
                onChange={(e) =>
                  setSeconds(Number.parseInt(e.target.value, 10) || 60)
                }
                min="10"
                max="3600"
                className="w-full px-3 py-2 bg-discord-darker border border-discord-border rounded-md text-white placeholder-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-blue focus:border-transparent"
              />
            </div>

            {/* Rules List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-md font-medium text-white">Rules</h4>
              </div>

              {floodRules.length === 0 ? (
                <div className="flex justify-center py-8">
                  <button
                    onClick={addFloodRule}
                    className="px-4 py-2 bg-discord-blue text-white rounded-md hover:bg-discord-blue-hover text-sm flex items-center gap-2"
                  >
                    <FaPlus size={14} />
                    Add Rule
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {floodRules.map((rule, index) => (
                    <div
                      key={`${rule.amount}-${rule.type}-${index}`}
                      className="p-4 bg-discord-dark rounded-lg"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Amount */}
                        <div>
                          <label className="text-xs font-medium text-discord-text-muted block mb-1">
                            Amount
                          </label>
                          <input
                            type="number"
                            value={rule.amount}
                            onChange={(e) =>
                              updateFloodRule(index, {
                                amount:
                                  Number.parseInt(e.target.value, 10) || 1,
                              })
                            }
                            min="1"
                            className="w-full px-2 py-1 bg-discord-darker border border-discord-border rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-discord-blue"
                          />
                        </div>

                        {/* Type */}
                        <div>
                          <label className="text-xs font-medium text-discord-text-muted block mb-1">
                            Type
                          </label>
                          <select
                            value={rule.type}
                            onChange={(e) =>
                              updateFloodRule(index, {
                                type: e.target.value as FloodRule["type"],
                              })
                            }
                            className="w-full px-2 py-1 bg-discord-darker border border-discord-border rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-discord-blue"
                          >
                            <option value="c">
                              CTCP ({getTypeDescription("c")})
                            </option>
                            <option value="j">
                              Join ({getTypeDescription("j")})
                            </option>
                            <option value="k">
                              Knock ({getTypeDescription("k")})
                            </option>
                            <option value="m">
                              Messages ({getTypeDescription("m")})
                            </option>
                            <option value="n">
                              Nickchange ({getTypeDescription("n")})
                            </option>
                            <option value="t">
                              Text ({getTypeDescription("t")})
                            </option>
                            <option value="r">
                              Repeat ({getTypeDescription("r")})
                            </option>
                          </select>
                        </div>

                        {/* Action */}
                        <div>
                          <label className="text-xs font-medium text-discord-text-muted block mb-1">
                            Action
                          </label>
                          <select
                            value={rule.action || getDefaultAction(rule.type)}
                            onChange={(e) =>
                              updateFloodRule(index, { action: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-discord-darker border border-discord-border rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-discord-blue"
                          >
                            <option value={getDefaultAction(rule.type)}>
                              {getDefaultAction(rule.type)} (default)
                            </option>
                            {getAvailableActions(rule.type)
                              .filter(
                                (action) =>
                                  action !== getDefaultAction(rule.type),
                              )
                              .map((action) => (
                                <option key={action} value={action}>
                                  {action}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Time */}
                        <div>
                          <label className="text-xs font-medium text-discord-text-muted block mb-1">
                            Time (min)
                          </label>
                          <input
                            type="number"
                            value={rule.time || ""}
                            onChange={(e) =>
                              updateFloodRule(index, {
                                time: e.target.value
                                  ? Number.parseInt(e.target.value, 10)
                                  : undefined,
                              })
                            }
                            placeholder="Permanent"
                            min="1"
                            className="w-full px-2 py-1 bg-discord-darker border border-discord-border rounded text-white text-sm placeholder-discord-text-muted focus:outline-none focus:ring-1 focus:ring-discord-blue"
                          />
                        </div>
                      </div>

                      {/* Remove button */}
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={() => removeFloodRule(index)}
                          className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1"
                        >
                          <FaTrash size={12} />
                          Remove Rule
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Rule Button - only show when there are existing rules */}
              {floodRules.length > 0 && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={addFloodRule}
                    className="px-4 py-2 bg-discord-blue text-white rounded-md hover:bg-discord-blue-hover text-sm flex items-center gap-2"
                  >
                    <FaPlus size={14} />
                    Add Rule
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-discord-dark-500 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-discord-text-muted hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-discord-blue text-white rounded-md hover:bg-discord-blue-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <FaSpinner className="animate-spin" size={14} />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FloodSettingsModal;
