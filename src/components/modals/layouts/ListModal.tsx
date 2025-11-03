import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "../base";

export interface ListModalProps<T> {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title: string | React.ReactNode;
  /** Items to display */
  items: T[];
  /** Function to render each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Function to extract unique key from item (required for proper React rendering) */
  getKey: (item: T, index: number) => string | number;
  /** Function to extract search text from item */
  getSearchText?: (item: T) => string;
  /** Whether search is enabled (default: true) */
  searchable?: boolean;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Message when no items match filter */
  emptyMessage?: string;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Maximum width (default: '2xl') */
  maxWidth?: "md" | "lg" | "xl" | "2xl" | "3xl";
  /** Custom filter function (overrides default search) */
  filterFunction?: (item: T, searchQuery: string) => boolean;
}

/**
 * List modal with search functionality
 */
export function ListModal<T>({
  isOpen,
  onClose,
  title,
  items,
  renderItem,
  getKey,
  getSearchText,
  searchable = true,
  searchPlaceholder = "Search...",
  emptyMessage = "No items found",
  footer,
  maxWidth = "2xl",
  filterFunction,
}: ListModalProps<T>) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, searchable]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!searchable || !search.trim()) return items;

    const query = search.toLowerCase();

    if (filterFunction) {
      return items.filter((item) => filterFunction(item, query));
    }

    if (getSearchText) {
      return items.filter((item) =>
        getSearchText(item).toLowerCase().includes(query),
      );
    }

    // Fallback: try to search in string representation
    return items.filter((item) => String(item).toLowerCase().includes(query));
  }, [items, search, searchable, getSearchText, filterFunction]);

  const widthClass = {
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
  }[maxWidth];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className={`bg-discord-dark-200 rounded-lg w-full ${widthClass} mx-4 max-h-[90vh] flex flex-col overflow-hidden`}
    >
      <ModalHeader title={title} onClose={onClose} />

      <ModalBody className="flex-1 flex flex-col">
        {searchable && (
          <div className="relative mb-4">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-discord-dark-400 border border-discord-dark-500 rounded px-10 py-2 text-white placeholder-discord-text-muted focus:outline-none focus:border-discord-primary"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="text-discord-text-muted text-center py-8">
              {emptyMessage}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item, index) => (
                <div key={getKey(item, index)}>{renderItem(item, index)}</div>
              ))}
            </div>
          )}
        </div>
      </ModalBody>

      {footer && <ModalFooter>{footer}</ModalFooter>}
    </Modal>
  );
}
