import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useLayoutStore, DesktopItem, getAllDesktopItems } from '../store/layoutStore';
import { useConfigStore } from '../store/configStore';
import { SettingsModal } from '../components/SettingsModal';
import { AuthModal } from '../components/AuthModal';
import { ProfileModal } from '../components/ProfileModal';
import { BookmarkBrowser } from '../components/apps/BookmarkBrowser';
import { AddItemModal } from '../components/AddItemModal';
import { ExploreWorld } from '../components/ExploreWorld';
import { useTranslation } from '../i18n/useTranslation';
import { getSmartFaviconUrl } from '../utils/favicon';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  closestCenter,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// === Icons ===
const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const GlobeIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
);

// Search Mode Icons
const GoogleGIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const BingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#00809D">
    <path d="M5.25 2.15v18.73l9.46 3.12 4.15-2.26V11.23L9.63 7.73v9.06l4.03-1.66v-2.02l-1.95.84V9.66l6.89 2.58v8.03l-3.37 1.83-8-2.67V2z"/>
  </svg>
);

const BookmarkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const DesktopAppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
    <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
  </svg>
);

const UserAvatarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);


// === DesktopIcon Component (static, used for DragOverlay and non-draggable contexts) ===
const DesktopIconContent: React.FC<{ 
  item: DesktopItem; 
  isDock?: boolean;
  isOverlay?: boolean;
  isDraggedOver?: boolean;
}> = ({ item, isDock, isOverlay, isDraggedOver }) => {
  const isFolder = item.type === 'folder';
  
  const getMiniIcons = (nodes: DesktopItem[]): string[] => {
    let urls: string[] = [];
    for (const n of nodes) {
      if (n.type === 'app' && n.icon) urls.push('');
      else if (n.url) urls.push(n.url);
      else if (n.children) urls = urls.concat(getMiniIcons(n.children));
    }
    return urls;
  };

  const miniIcons = isFolder && item.children ? getMiniIcons(item.children).slice(0, 9) : [];
  const iconSize = isDock ? 'w-[56px] h-[56px] md:w-[60px] md:h-[60px]' : 'w-[60px] h-[60px] md:w-[78px] md:h-[78px]';

  // Check if the icon should use a bare image style (iOS-like, no wrapper background)
  const hasImageIcon = !isFolder && item.type !== 'app' && (
    (item.icon && item.icon.startsWith('http')) || (!item.icon && item.url)
  );
  
  return (
    <div className={`flex flex-col items-center ${isDock ? 'w-auto' : 'w-[72px] md:w-[90px]'} ${isOverlay ? 'opacity-90 scale-110' : ''}`}>
      <div className={`${iconSize} rounded-[18px] overflow-hidden transition-all duration-200 relative ${
        hasImageIcon
          ? `shadow-lg ${isDraggedOver && isFolder
              ? 'scale-125 shadow-[0_0_30px_rgba(255,255,255,0.3)]'
              : isOverlay
                ? 'shadow-[0_16px_50px_rgba(0,0,0,0.4)]'
                : ''
            }`
          : `bg-white/[0.12] backdrop-blur-xl border shadow-lg flex items-center justify-center ${
              isDraggedOver && isFolder
                ? 'scale-125 bg-white/30 border-white/50 shadow-[0_0_30px_rgba(255,255,255,0.3)]'
                : isOverlay
                  ? 'border-white/30 shadow-[0_16px_50px_rgba(0,0,0,0.4)]'
                  : 'border-white/15'
            }`
      }`}>
        {isFolder ? (
          <div className="grid grid-cols-3 grid-rows-3 gap-1 p-2.5 w-full h-full">
            {miniIcons.map((url, i) => (
              <div key={i} className="rounded-[3px] overflow-hidden bg-white/10 flex items-center justify-center">
                <img 
                  src={getSmartFaviconUrl(url, 64)}
                  className="w-[88%] h-[88%] object-contain"
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            ))}
            {miniIcons.length === 0 && (
               <div className="col-span-3 row-span-3 flex items-center justify-center opacity-30">
                 <GlobeIcon size={22} />
               </div>
            )}
          </div>
        ) : (
          <>
            {item.type === 'app' ? (
              <div className="flex items-center justify-center w-full h-full text-3xl md:text-4xl">
                {item.icon || '📦'}
              </div>
            ) : item.icon ? (
              item.icon.startsWith('http') ? (
                <img src={item.icon} className="w-full h-full object-cover" alt={item.title} onError={(e) => { e.currentTarget.style.display = 'none'; const s = e.currentTarget.nextElementSibling as HTMLElement; if (s) s.style.display = 'flex'; }} />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-3xl md:text-4xl">{item.icon}</div>
              )
            ) : item.url ? (
              <img 
                src={getSmartFaviconUrl(item.url, 128)}
                className="w-full h-full object-cover"
                alt={item.title}
                onError={(e) => { e.currentTarget.style.display = 'none'; const s = e.currentTarget.nextElementSibling as HTMLElement; if (s) s.style.display = 'flex'; }}
              />
            ) : null}
            <div className="absolute inset-0 items-center justify-center hidden z-0">
               <GlobeIcon size={28} />
            </div>
          </>
        )}
      </div>
      {!isDock && (
        <span className="mt-1.5 text-[12px] font-medium text-white tracking-wide w-full text-center px-0.5 truncate drop-shadow-md">
          {item.title || 'Untitled'}
        </span>
      )}
    </div>
  );
};

// === Sortable Desktop Icon (used in grids) ===
const SortableDesktopIcon: React.FC<{
  item: DesktopItem;
  onClick: (item: DesktopItem) => void;
  onContextMenu?: (e: React.MouseEvent, item: DesktopItem) => void;
  isDock?: boolean;
  isDraggedOver?: boolean;
  activeId?: string | null;
  isFolderDropPending?: boolean;
}> = ({ item, onClick, onContextMenu, isDock, isDraggedOver, activeId, isFolderDropPending }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id,
    data: { item, isDock, isFolder: item.type === 'folder' },
  });

  // When the folder hover timer has fired (folderDropTargetId is set),
  // freeze sortable transforms so the grid stays stable and the user can
  // clearly see which folder they're about to drop into.
  // Before the timer fires, normal reordering continues unhindered.
  const shouldFreezeTransform = isFolderDropPending && !isDragging;

  const style: React.CSSProperties = {
    transform: shouldFreezeTransform ? undefined : CSS.Transform.toString(transform),
    transition: shouldFreezeTransform ? 'none' : (transition || 'transform 250ms cubic-bezier(0.25, 1, 0.5, 1)'),
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 0 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`touch-none ${activeId ? 'cursor-grabbing' : 'cursor-pointer'}`}
      data-desktop-icon="true"
      onClick={(e) => {
        if (!isDragging) {
          e.preventDefault();
          onClick(item);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, item);
      }}
    >
      <div className={`group ${isDock ? '' : ''}`}>
        <div className={`transition-transform duration-200 ${isDraggedOver && item.type === 'folder' ? 'scale-110' : 'group-hover:scale-110 group-active:scale-95'}`}>
          <DesktopIconContent item={item} isDock={isDock} isDraggedOver={isDraggedOver} />
        </div>
      </div>
    </div>
  );
};

// === Droppable zone: page background (catch drops on blank areas) ===
const PAGE_DROP_PREFIX = '__page-drop-';
const PageDropZone: React.FC<{ pageIdx: number; children: React.ReactNode }> = ({ pageIdx, children }) => {
  const { setNodeRef } = useDroppable({
    id: `${PAGE_DROP_PREFIX}${pageIdx}`,
    data: { isPageDrop: true, pageIdx },
  });
  return (
    <div ref={setNodeRef} className="min-w-full h-full snap-center pt-4 flex flex-col items-center">
      {children}
    </div>
  );
};

// === Droppable zone: "Move out of folder" ===
// Shown at the bottom of the folder overlay when the user starts dragging an item
// inside the folder. Dropping here moves the item back to the desktop page.
const FOLDER_DROP_OUT_ID = '__folder-drop-out__';

const FolderDropOutZone: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: FOLDER_DROP_OUT_ID,
    data: { isFolderDropOut: true },
  });
  const { t } = useTranslation();

  return (
    <div
      ref={setNodeRef}
      className={`
        transition-all duration-300 ease-out overflow-hidden
        ${isActive ? 'max-h-24 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}
      `}
    >
      <div
        className={`
          flex items-center justify-center gap-2 py-4 px-6 mx-4 sm:mx-8 rounded-2xl
          border-2 border-dashed transition-all duration-200
          ${isOver
            ? 'border-white/60 bg-white/20 scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.15)]'
            : 'border-white/20 bg-white/[0.06]'
          }
        `}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-colors duration-200 ${isOver ? 'text-white' : 'text-white/40'}`}
        >
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </svg>
        <span className={`text-sm font-medium transition-colors duration-200 ${isOver ? 'text-white' : 'text-white/40'}`}>
          {t('desktop.dropOutOfFolder')}
        </span>
      </div>
    </div>
  );
};


// === Search Modes ===
type SearchMode = 'google' | 'bing' | 'bookmarks' | 'history' | 'desktop';

const SEARCH_MODES = [
  { id: 'google', icon: <GoogleGIcon /> },
  { id: 'bing', icon: <BingIcon /> },
  { id: 'bookmarks', icon: <BookmarkIcon /> },
  { id: 'history', icon: <HistoryIcon /> },
  { id: 'desktop', icon: <DesktopAppIcon /> },
] as const;


// === Custom collision detection: debounce reordering so icons don't swap too eagerly ===
//
// Problem: closestCenter triggers a reorder the moment the dragged item's center is
// closer to a neighbour than its own slot. This is too sensitive — the user can't hover
// over a folder for 500ms because the icon gets swapped away almost immediately.
//
// Solution: we add TWO layers of protection:
// 1. Distance threshold: ignore collisions whose centre-distance exceeds a generous limit.
// 2. Time-based debounce: a new "over" target must persist for SORT_DEBOUNCE_MS before
//    we actually report it. While the debounce timer is running we keep reporting the
//    *previous* stable target, giving the user time to pause on a folder.
//
// The debounce state lives outside the function so it persists across calls.
const SORT_DEBOUNCE_MS = 300; // ms the pointer must stay on a new target before swapping
let _stableOverId: string | number | null = null;
let _pendingOverId: string | number | null = null;
let _pendingTimestamp = 0;

function createFolderAwareCollision(_draggedItem: DesktopItem | null): CollisionDetection {
  return (args) => {
    const collisions = closestCenter(args);
    if (!collisions || collisions.length === 0) {
      // Nothing nearby — reset debounce and report empty
      _stableOverId = null;
      _pendingOverId = null;
      return collisions;
    }

    // Always keep special droppable zones in the results —
    // they should not be subject to distance filtering or debounce.
    const isSpecialZone = (id: string | number) => {
      const idStr = String(id);
      return idStr === FOLDER_DROP_OUT_ID || idStr.startsWith(PAGE_DROP_PREFIX);
    };
    const specialCollisions = collisions.filter((c) => isSpecialZone(c.id));

    // --- Distance filter ---
    const activeRect = args.active.rect.current.translated;
    if (!activeRect) return collisions;

    // Keep only collisions that are within a generous distance.
    // We use 0.75× the cell-to-cell centre distance as the threshold.
    // For desktop: cell dist ≈ 150px → threshold ≈ 112px
    // For mobile:  cell dist ≈  96px → threshold ≈  72px
    // This filters out far-away items while still allowing natural reordering.
    const iconSize = Math.min(activeRect.width, activeRect.height);
    const threshold = iconSize * 1.25;

    const close = collisions.filter((c) => {
      if (isSpecialZone(c.id)) return false; // handled separately
      const d = typeof c.data?.value === 'number' ? c.data.value : 0;
      return d <= threshold;
    });

    // Helper: append special zone collisions (page drop zones, folder drop-out)
    // to any result set, ensuring they are always reachable.
    // Special zones are appended at the END so regular icon collisions take
    // priority; page drop zones only kick in when no icon is close enough.
    const withSpecialZones = (result: typeof collisions) => {
      if (specialCollisions.length === 0) return result;
      const filtered = result.filter((c) => !isSpecialZone(c.id));
      // If no normal collisions, special zones become the fallback
      if (filtered.length === 0) return specialCollisions;
      return [...filtered, ...specialCollisions];
    };

    if (close.length === 0) {
      // No close collision — if we have special zones, return those as fallback
      if (specialCollisions.length > 0) {
        return specialCollisions;
      }
      // Otherwise keep the stable target so the grid doesn't jitter
      if (_stableOverId != null) {
        // Return the previous stable collision so SortableContext keeps its state
        const kept = collisions.find((c) => c.id === _stableOverId);
        return withSpecialZones(kept ? [kept] : []);
      }
      return withSpecialZones([]);
    }

    // --- Time-based debounce ---
    const topId = close[0].id;
    const now = Date.now();

    if (topId === _stableOverId) {
      // Same as the current stable target — no change needed
      _pendingOverId = null;
      return withSpecialZones(close);
    }

    if (topId !== _pendingOverId) {
      // New candidate — start the debounce timer
      _pendingOverId = topId;
      _pendingTimestamp = now;
      // Keep reporting the previous stable target in the meantime
      if (_stableOverId != null) {
        const kept = collisions.find((c) => c.id === _stableOverId);
        return withSpecialZones(kept ? [kept] : close);
      }
      return withSpecialZones(close);
    }

    // Same candidate as pending — check if debounce time has elapsed
    if (now - _pendingTimestamp >= SORT_DEBOUNCE_MS) {
      // Debounce complete — accept the new target
      _stableOverId = topId;
      _pendingOverId = null;
      return withSpecialZones(close);
    }

    // Still waiting — keep reporting the old stable target
    if (_stableOverId != null) {
      const kept = collisions.find((c) => c.id === _stableOverId);
      return withSpecialZones(kept ? [kept] : close);
    }
    return withSpecialZones(close);
  };
}


// === Main Desktop Page ===

export const Desktop: React.FC = () => {
  const { fetchBookmarks } = useBookmarkStore();
  const { layout, removeDesktopItem, moveItemToDock, moveItemFromDock, reorderDesktopItem, moveItemToFolder, moveItemToPage, reorderInsideFolder, moveItemOutOfFolder, updateDesktopItem } = useLayoutStore();
  const { jwtToken } = useConfigStore();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('google');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'wallpaper' | 'system'>('wallpaper');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBookmarkBrowserOpen, setIsBookmarkBrowserOpen] = useState(false);
  const [openedFolder, setOpenedFolder] = useState<DesktopItem | null>(null);
  const [searchResults, setSearchResults] = useState<DesktopItem[]>([]);
  
  // Add/Edit/Context menu state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DesktopItem | null>(null);
  const [addToFolderId, setAddToFolderId] = useState<string | undefined>(undefined);
  const [addToPageIndex, setAddToPageIndex] = useState<number | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: DesktopItem; inDock?: boolean } | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Explore World state
  const [isExploreOpen, setIsExploreOpen] = useState(false);

  // Folder rename state
  const [isEditingFolderName, setIsEditingFolderName] = useState(false);
  const [editingFolderName, setEditingFolderName] = useState('');
  const folderNameInputRef = useRef<HTMLInputElement>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  // Track whether the currently dragged item originally came from the dock.
  // This is needed because after a cross-container move during dragOver,
  // the item is already in pages but still needs manual reordering calls
  // (SortableContext can't auto-sort items that were added mid-drag).
  const dragStartedInDockRef = useRef(false);
  // Guard against infinite re-render loops: track the last reorder source→target
  // pair so we never fire the same cross-container move twice in a row.
  const lastReorderRef = useRef<string | null>(null);
  const folderHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  // Track the last folder we hovered over (survives brief flickers away)
  const lastFolderOverRef = useRef<string | null>(null);
  // When true, sortable transforms are frozen so the grid doesn't reorder while hovering a folder
  const [isFolderDropPending, setIsFolderDropPending] = useState(false);

  const allItems = useMemo(() => getAllDesktopItems(layout), [layout]);

  // Find item by id across all pages and dock
  const findItemById = useCallback((id: string): DesktopItem | null => {
    const searchIn = (items: DesktopItem[]): DesktopItem | null => {
      for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
          const found = searchIn(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    for (const page of layout.pages) {
      const found = searchIn(page);
      if (found) return found;
    }
    return searchIn(layout.dock);
  }, [layout]);

  const activeItem = activeId ? findItemById(activeId) : null;

  // Collision detection: when dragging a folder, skip folder-priority so folders reorder normally
  const collisionDetection = useMemo(() => createFolderAwareCollision(activeItem), [activeItem]);

  // Sensors: delay to distinguish click from drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const getSearchModeLabel = (id: SearchMode) => {
    switch (id) {
      case 'google': return t('search.google');
      case 'bing': return t('search.bing');
      case 'bookmarks': return t('search.bookmarks');
      case 'history': return t('search.history');
      case 'desktop': return t('search.desktop');
    }
  };

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  // Live search
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || searchMode === 'google' || searchMode === 'bing') {
      setSearchResults([]);
      return;
    }

    if (searchMode === 'desktop') {
      const filtered = allItems.filter(item => 
        (item.title && item.title.toLowerCase().includes(q)) || 
        (item.url && item.url.toLowerCase().includes(q))
      );
      setSearchResults(filtered);
    } 
    else if (searchMode === 'bookmarks') {
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        chrome.bookmarks.search(q, (results) => {
          const nodes: DesktopItem[] = results.map(r => ({
            id: r.id, type: 'link', title: r.title, url: r.url
          }));
          setSearchResults(nodes.slice(0, 50));
        });
      } else {
        setSearchResults(allItems.filter(item => item.title.toLowerCase().includes(q)));
      }
    } 
    else if (searchMode === 'history') {
      if (typeof chrome !== 'undefined' && chrome.history) {
        chrome.history.search({ text: q, maxResults: 50 }, (results) => {
          const historyNodes: DesktopItem[] = results.map(r => ({
            id: r.id,
            type: 'link',
            title: r.title || r.url || 'History Item',
            url: r.url
          }));
          setSearchResults(historyNodes);
        });
      } else {
        setSearchResults([]);
      }
    }
  }, [searchQuery, searchMode, allItems]);

  const handleItemClick = (item: DesktopItem) => {
    if (activeId) return;
    if (item.type === 'link' && item.url) {
      window.open(item.url, '_blank');
    } else if (item.type === 'folder') {
      setOpenedFolder(item);
    } else if (item.type === 'app') {
      if (item.id === 'app-bookmarks') {
        setIsBookmarkBrowserOpen(true);
      }
    }
  };

  useEffect(() => {
    if (openedFolder) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [openedFolder]);

  // === DnD Handlers ===
  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Reset collision debounce state for the new drag session
    _stableOverId = null;
    _pendingOverId = null;
    _pendingTimestamp = 0;
    const id = event.active.id as string;
    setActiveId(id);
    // Remember whether the item started in the dock so we can continue
    // manually reordering it after a cross-container move (see handleDragOver).
    dragStartedInDockRef.current = layout.dock.some(item => item.id === id);
    lastReorderRef.current = null;
    setContextMenu(null);
    // Freeze the page scroller during drag to prevent touch-drag from being
    // interpreted as a page-swipe on mobile.
    if (pagesContainerRef.current) {
      pagesContainerRef.current.style.overflow = 'hidden';
      pagesContainerRef.current.style.scrollSnapType = 'none';
    }
  }, [layout.dock]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const newOverId = over?.id as string | null;

    // If the dragged item itself is a folder, skip folder-hover detection entirely
    // so that folders can be reordered freely via normal sortable logic.
    const activeItem_ = activeId ? findItemById(activeId) : null;
    const isDraggingFolder = activeItem_?.type === 'folder';

    // --- Helper: compute overlap ratio between the dragged icon and the over element ---
    // Returns a value between 0 and 1, representing how much of the smaller rect
    // is overlapping with the over rect. This is more reliable than pointer-based
    // detection because the dragged overlay has real size.
    const getOverlapRatio = (): number => {
      // active.rect.current.translated is the real-time rect of the dragged item
      const activeRect = active.rect.current.translated;
      const overRect = over?.rect;
      if (!activeRect || !overRect) return 0;

      const overlapLeft = Math.max(activeRect.left, overRect.left);
      const overlapRight = Math.min(activeRect.right, overRect.right);
      const overlapTop = Math.max(activeRect.top, overRect.top);
      const overlapBottom = Math.min(activeRect.bottom, overRect.bottom);

      if (overlapLeft >= overlapRight || overlapTop >= overlapBottom) return 0;

      const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
      // Use the smaller rect's area as denominator so ratio is meaningful
      const activeArea = activeRect.width * activeRect.height;
      const overArea = overRect.width * overRect.height;
      const smallerArea = Math.min(activeArea, overArea);

      return smallerArea > 0 ? overlapArea / smallerArea : 0;
    };

    // Overlap threshold: the dragged icon must overlap ≥50% of the folder to trigger
    const FOLDER_OVERLAP_THRESHOLD = 0.5;

    // --- Folder hover detection ---
    // When the dragged icon overlaps a folder enough AND stays there long enough (500ms),
    // we mark it as a drop target. While the overlap is sufficient, we PAUSE normal
    // reordering so the icon doesn't get pushed away before the timer fires.
    let isOverFolder = false;

    if (!isDraggingFolder && newOverId && newOverId !== activeId) {
      const overItem = findItemById(newOverId);
      const overlapRatio = getOverlapRatio();

      if (overItem?.type === 'folder' && overlapRatio >= FOLDER_OVERLAP_THRESHOLD) {
        // Sufficient overlap with a folder — start/continue hover timer
        isOverFolder = true;
        if (lastFolderOverRef.current !== newOverId) {
          // Switched to a different folder — restart timer
          lastFolderOverRef.current = newOverId;
          if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
          setFolderDropTargetId(null);
          setIsFolderDropPending(true); // Freeze grid immediately to prevent reorder
          folderHoverTimerRef.current = setTimeout(() => {
            setFolderDropTargetId(newOverId);
          }, 500);
        }
        // Same folder as before — keep the timer running, stay frozen
      } else {
        // Over a non-folder item, or not enough overlap — clear folder hover state
        if (lastFolderOverRef.current) {
          if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
          lastFolderOverRef.current = null;
          setFolderDropTargetId(null);
          setIsFolderDropPending(false);
        }
      }
    } else if (!newOverId || newOverId === activeId) {
      // Not over anything meaningful — clear folder hover state
      if (lastFolderOverRef.current) {
        if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
        lastFolderOverRef.current = null;
        setFolderDropTargetId(null);
        setIsFolderDropPending(false);
      }
    }

    // --- Normal reordering (skip when hovering a folder) ---
    // When the icon is sufficiently overlapping a folder, we pause reordering
    // so the icon stays in place and the user has time to trigger folder drop.
    if (isOverFolder) return;

    // --- Cross-container drag (Desktop ↔ Dock) ---
    // @dnd-kit's SortableContext only animates items within the SAME context.
    // To get smooth reorder animations when dragging between Desktop and Dock,
    // we must move the item between containers in real-time during dragOver.
    if (newOverId && newOverId !== activeId && !openedFolder) {
      const overIdStr = String(newOverId);

      // If hovering over a page drop zone (blank area), move dock item to that page
      if (overIdStr.startsWith(PAGE_DROP_PREFIX)) {
        const sourceInDock = layout.dock.some(item => item.id === activeId);
        if (sourceInDock && activeId) {
          const pageIdx = parseInt(overIdStr.slice(PAGE_DROP_PREFIX.length), 10);
          moveItemToPage(activeId, pageIdx);
        }
        return;
      }

      // Determine where source currently lives by checking layout data (not stale active.data)
      const sourceInDock = layout.dock.some(item => item.id === activeId);
      const overData = over?.data.current as { isDock?: boolean } | undefined;
      const targetIsDock = !!overData?.isDock;

      const reorderKey = `${active.id}->${newOverId}`;
      const shouldReorder =
        (sourceInDock !== targetIsDock) ||
        (!sourceInDock && !targetIsDock && dragStartedInDockRef.current);

      if (shouldReorder && lastReorderRef.current !== reorderKey) {
        // Record this pair so we don't fire the same move again when
        // @dnd-kit re-measures and re-fires handleDragOver synchronously.
        lastReorderRef.current = reorderKey;
        reorderDesktopItem(active.id as string, newOverId);
      }
    }
  }, [activeId, findItemById, openedFolder, reorderDesktopItem, moveItemToPage, layout]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
    // Reset collision debounce state
    _stableOverId = null;
    _pendingOverId = null;
    _pendingTimestamp = 0;
    // Restore page scroller after drag
    if (pagesContainerRef.current) {
      pagesContainerRef.current.style.overflow = '';
      pagesContainerRef.current.style.scrollSnapType = '';
    }

    const sourceId = active.id as string;
    const targetId = over?.id as string | null;

    // --- Drop onto the "move out of folder" zone ---
    if (targetId === FOLDER_DROP_OUT_ID && openedFolder) {
      const isSourceInFolder = openedFolder.children?.some(c => c.id === sourceId);
      if (isSourceInFolder) {
        moveItemOutOfFolder(sourceId, openedFolder.id, currentPage);
        setActiveId(null);
        setFolderDropTargetId(null);
        lastFolderOverRef.current = null;
        setIsFolderDropPending(false);
        return;
      }
    }

    // --- Drop onto a page blank area ---
    // If the item was dropped on the page droppable zone (not on a specific icon),
    // move it to that page. This handles Dock→Desktop drag to empty areas.
    if (targetId && typeof targetId === 'string' && targetId.startsWith(PAGE_DROP_PREFIX)) {
      // The item was already moved during dragOver, just clean up
      const sourceStillInDock = layout.dock.some(item => item.id === sourceId);
      if (sourceStillInDock) {
        const pageIdx = parseInt(targetId.slice(PAGE_DROP_PREFIX.length), 10);
        moveItemToPage(sourceId, pageIdx);
      }
      setActiveId(null);
      setFolderDropTargetId(null);
      lastFolderOverRef.current = null;
      setIsFolderDropPending(false);
      return;
    }

    if (targetId && sourceId !== targetId) {
      const targetItem = findItemById(targetId);
      const sourceItem_ = findItemById(sourceId);

      // --- Drop into folder ---
      // Only accept the drop into a folder when folderDropTargetId is set,
      // which means the user hovered over the folder long enough (≥500ms).
      // If the user just passed through quickly, treat it as a normal reorder.
      // Never drop a folder INTO another folder — folders should only reorder.
      const isDraggingFolder = sourceItem_?.type === 'folder';
      const shouldDropIntoFolder = !isDraggingFolder
        && targetItem?.type === 'folder'
        && folderDropTargetId === targetId;

      if (shouldDropIntoFolder) {
        moveItemToFolder(sourceId, targetId);
        setActiveId(null);
        setFolderDropTargetId(null);
        lastFolderOverRef.current = null;
        setIsFolderDropPending(false);
        return;
      }

      // Check if we're inside a folder overlay
      if (openedFolder) {
        const isSourceInFolder = openedFolder.children?.some(c => c.id === sourceId);
        const isTargetInFolder = openedFolder.children?.some(c => c.id === targetId);
        
        if (isSourceInFolder && isTargetInFolder) {
          reorderInsideFolder(openedFolder.id, sourceId, targetId);
        } else if (isSourceInFolder && !isTargetInFolder) {
          moveItemOutOfFolder(sourceId, openedFolder.id, currentPage);
        }
      } else {
        reorderDesktopItem(sourceId, targetId);
      }
    }

    setActiveId(null);
    dragStartedInDockRef.current = false;
    lastReorderRef.current = null;
    setFolderDropTargetId(null);
    lastFolderOverRef.current = null;
    setIsFolderDropPending(false);
  }, [folderDropTargetId, findItemById, moveItemToFolder, moveItemToPage, openedFolder, reorderInsideFolder, moveItemOutOfFolder, reorderDesktopItem, currentPage, layout]);

  const handleDragCancel = useCallback(() => {
    if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
    _stableOverId = null;
    _pendingOverId = null;
    _pendingTimestamp = 0;
    // Restore page scroller after drag
    if (pagesContainerRef.current) {
      pagesContainerRef.current.style.overflow = '';
      pagesContainerRef.current.style.scrollSnapType = '';
    }
    setActiveId(null);
    dragStartedInDockRef.current = false;
    lastReorderRef.current = null;
    setFolderDropTargetId(null);
    lastFolderOverRef.current = null;
    setIsFolderDropPending(false);
  }, []);

  const handleAuthClick = () => {
    if (jwtToken) setIsProfileOpen(true);
    else setIsAuthOpen(true);
  };

  const handleContextMenu = (e: React.MouseEvent, item: DesktopItem, inDock?: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item, inDock });
  };

  const handleEdit = (item: DesktopItem) => {
    setEditingItem(item);
    setIsAddModalOpen(true);
    setContextMenu(null);
  };

  const handleDelete = (item: DesktopItem) => {
    if (window.confirm(t('desktop.deleteConfirm', { title: item.title }))) {
      removeDesktopItem(item.id);
    }
    setContextMenu(null);
  };

  const openAddModal = (pageIdx?: number, folderId?: string) => {
    setEditingItem(null);
    setAddToFolderId(folderId);
    setAddToPageIndex(pageIdx);
    setIsAddModalOpen(true);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    if (searchMode === 'google') {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
    } else if (searchMode === 'bing') {
      window.open(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, '_blank');
    } else {
      if (searchResults.length > 0 && searchResults[0].url) {
        window.location.href = searchResults[0].url;
      }
    }
  };

  // Handle page scroll snapping
  const scrollToPage = (pageIdx: number) => {
    if (pagesContainerRef.current) {
      const w = pagesContainerRef.current.clientWidth;
      pagesContainerRef.current.scrollTo({ left: w * pageIdx, behavior: 'smooth' });
    }
    setCurrentPage(pageIdx);
  };

  const handlePageScroll = () => {
    if (pagesContainerRef.current) {
      const w = pagesContainerRef.current.clientWidth;
      const scrollLeft = pagesContainerRef.current.scrollLeft;
      const page = Math.round(scrollLeft / w);
      setCurrentPage(page);
    }
  };

  const isLocalSearchActive = (searchMode !== 'google' && searchMode !== 'bing' && searchQuery.trim() !== '');

  // IDs for sortable contexts
  const pageItemIds = useMemo(() => layout.pages.map(page => page.map(item => item.id)), [layout.pages]);
  const dockItemIds = useMemo(() => layout.dock.map(item => item.id), [layout.dock]);
  const folderItemIds = useMemo(() => openedFolder?.children?.map(item => item.id) ?? [], [openedFolder]);

  // For the Add (+) icon
  const AddButton: React.FC<{ pageIdx?: number; folderId?: string }> = ({ pageIdx, folderId }) => (
    <div className="flex flex-col items-center w-[72px] md:w-[90px] group" data-add-button="true" onClick={() => openAddModal(pageIdx, folderId)}>
      <div className="w-[60px] h-[60px] md:w-[78px] md:h-[78px] rounded-[18px] bg-white/[0.06] border-2 border-dashed border-white/15 flex items-center justify-center transition-all duration-300 transform group-hover:scale-110 group-active:scale-95 group-hover:bg-white/10 group-hover:border-white/30 cursor-pointer">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30 group-hover:text-white/70 transition-colors">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <span className="mt-1.5 text-[12px] font-medium text-white/30 group-hover:text-white/70 tracking-wide transition-colors">
        {t('desktop.addLink')}
      </span>
    </div>
  );

  // Keep openedFolder in sync with layout changes
  useEffect(() => {
    if (openedFolder) {
      const updated = findItemById(openedFolder.id);
      if (updated && updated.type === 'folder') {
        setOpenedFolder(updated);
      }
    }
  }, [layout, openedFolder?.id, findItemById]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="w-full h-full flex flex-col overflow-hidden relative">
      
      {/* 1. Search Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex justify-center pt-14 md:pt-14 px-6 pointer-events-none">
        <div className="w-full max-w-[580px] pointer-events-auto">
          <form onSubmit={handleSearchSubmit} className="relative group flex items-center">
            {isDropdownOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
            )}
            <div className="absolute inset-y-0 left-2 z-50 flex items-center">
              <button 
                type="button" 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="p-2 ml-0.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100"
              >
                {SEARCH_MODES.find(m => m.id === searchMode)?.icon}
              </button>
              {isDropdownOpen && (
                <div className="absolute top-12 left-0 w-[200px] bg-[#1a1c1a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 fade-in">
                  {SEARCH_MODES.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setSearchMode(mode.id as SearchMode);
                        setIsDropdownOpen(false);
                        if (searchInputRef.current) searchInputRef.current.focus();
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${searchMode === mode.id ? 'bg-white/15 shadow-md shadow-black/20 text-white' : 'hover:bg-white/5 text-white/80'}`}
                    >
                      <div className="shrink-0">{mode.icon}</div>
                      <span className="text-[13px] font-medium tracking-wide">{getSearchModeLabel(mode.id as SearchMode)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder={
                searchMode === 'google' ? t('desktop.searchGoogle') :
                searchMode === 'bing' ? t('desktop.searchBing') :
                searchMode === 'bookmarks' ? t('desktop.searchBookmarks') :
                searchMode === 'history' ? t('desktop.searchHistory') :
                t('desktop.searchDesktop')
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/30 backdrop-blur-xl border border-white/10 hover:border-white/20 hover:bg-black/40 focus:bg-black/50 focus:border-white/30 rounded-full py-3 md:py-3.5 pl-14 pr-6 text-[14px] font-medium text-white shadow-2xl outline-none placeholder-white/40 transition-all duration-300"
            />
          </form>
        </div>
      </div>

      {/* 2. Pages Area */}
      <div 
        className="flex-1 overflow-hidden pt-48 md:pt-56 pb-28 md:pb-32"
        onDoubleClick={(e) => {
          // Only trigger on blank area (the container itself or the page wrapper)
          const target = e.target as HTMLElement;
          if (target.closest('[data-desktop-icon]') || target.closest('[data-add-button]')) return;
          setIsExploreOpen(true);
        }}
        onContextMenu={(e) => {
          // Right-click on blank area (not on an icon)
          const target = e.target as HTMLElement;
          if (target.closest('[data-desktop-icon]') || target.closest('[data-add-button]')) return;
          e.preventDefault();
          setBlankContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {isLocalSearchActive ? (
          <div className="h-full overflow-y-auto no-scrollbar pt-4 flex justify-center">
            <div
              className="desktop-icon-grid grid content-start w-full md:px-4"
              style={{ justifyContent: 'center', justifyItems: 'center' }}
            >
              {searchResults.length > 0 ? (
                searchResults.map(item => (
                  <div key={item.id} className="cursor-pointer group" onClick={() => handleItemClick(item)}>
                    <div className="group-hover:scale-110 group-active:scale-95 transition-transform duration-200">
                      <DesktopIconContent item={item} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full opacity-60 text-center mt-20 fade-in">
                  <p className="text-4xl mb-4">📭</p>
                  <p>{t('desktop.noResults')} "{searchQuery}"</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div 
            ref={pagesContainerRef}
            className="h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
            onScroll={handlePageScroll}
          >
            {layout.pages.map((page, pageIdx) => (
              <PageDropZone key={pageIdx} pageIdx={pageIdx}>
                <SortableContext items={pageItemIds[pageIdx] || []} strategy={rectSortingStrategy}>
                  <div
                    className="desktop-icon-grid grid content-start w-full md:px-4"
                    style={{ justifyContent: 'center', justifyItems: 'center' }}
                  >
                    {page.map(item => (
                      <SortableDesktopIcon 
                        key={item.id} 
                        item={item} 
                        onClick={handleItemClick} 
                        onContextMenu={(e, i) => handleContextMenu(e, i, false)}
                        isDraggedOver={folderDropTargetId === item.id}
                        activeId={activeId}
                        isFolderDropPending={isFolderDropPending}
                      />
                    ))}
                    <AddButton pageIdx={pageIdx} />
                  </div>
                </SortableContext>
              </PageDropZone>
            ))}
          </div>
        )}
      </div>

      {/* 3. Page Indicator Dots */}
      {!isLocalSearchActive && layout.pages.length > 1 && (
        <div className="absolute bottom-[108px] md:bottom-[118px] left-0 right-0 z-20 flex justify-center gap-2">
          {layout.pages.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToPage(i)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${currentPage === i ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`}
            />
          ))}
        </div>
      )}

      {/* 4. Dock Bar */}
      <div className="absolute bottom-3 md:bottom-5 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-5 md:gap-6 px-5 md:px-7 py-2.5 md:py-3 bg-[#f5f5f5]/[0.12] backdrop-blur-[50px] border border-white/[0.15] rounded-[22px] md:rounded-[26px] shadow-[0_2px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <SortableContext items={dockItemIds} strategy={rectSortingStrategy}>
            {layout.dock.map(item => (
              <SortableDesktopIcon 
                key={item.id} 
                item={item} 
                onClick={handleItemClick} 
                onContextMenu={(e, i) => handleContextMenu(e, i, true)} 
                isDock
                isDraggedOver={folderDropTargetId === item.id}
                activeId={activeId}
                isFolderDropPending={isFolderDropPending}
              />
            ))}
          </SortableContext>
        </div>
      </div>

      {/* 5. Settings Button */}
      <div className="fixed top-4 left-4 md:top-6 md:left-6 z-30">
        <button 
          className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/15 hover:text-white transition-all duration-300 shadow-xl hover:scale-110 active:scale-95 cursor-pointer"
          onClick={() => setIsSettingsOpen(true)}
        >
          <SettingsIcon />
        </button>
      </div>

      {/* 6. User/Auth Button */}
      <div className="fixed top-4 right-4 md:top-6 md:right-6 z-30">
        <button 
          className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all duration-300 shadow-xl hover:scale-110 active:scale-95 cursor-pointer ${jwtToken ? 'bg-[#72d565]/80 text-black border-[#72d565]' : 'bg-black/30 text-white/60 border-white/10 hover:bg-white/15 hover:text-white'}`}
          onClick={handleAuthClick}
        >
          <UserAvatarIcon />
        </button>
      </div>

      {/* 7. Folder Overlay */}
      {openedFolder && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-lg animate-fadeIn p-4 sm:p-12"
          onClick={() => { setOpenedFolder(null); setIsEditingFolderName(false); }}
        >
          <div className="w-full max-w-5xl flex flex-col items-start pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            {/* Folder name - outside the rounded container, at top-left */}
            <div className="pl-6 sm:pl-10 pb-5 shrink-0">
              {isEditingFolderName ? (
                <input
                  ref={folderNameInputRef}
                  type="text"
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onBlur={() => {
                    const trimmed = editingFolderName.trim();
                    if (trimmed && trimmed !== openedFolder.title) {
                      updateDesktopItem(openedFolder.id, { title: trimmed });
                    }
                    setIsEditingFolderName(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      setIsEditingFolderName(false);
                    }
                  }}
                  className="text-2xl sm:text-3xl font-bold text-white tracking-wide bg-transparent border-b-2 border-white/40 outline-none max-w-[400px] pb-1 placeholder-white/30"
                  placeholder={t('desktop.folderNamePlaceholder')}
                  autoFocus
                />
              ) : (
                <button
                  className="group flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    setEditingFolderName(openedFolder.title);
                    setIsEditingFolderName(true);
                    setTimeout(() => folderNameInputRef.current?.select(), 50);
                  }}
                  title={t('desktop.folderRenameHint')}
                >
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide drop-shadow-lg">
                    {openedFolder.title}
                  </h2>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white/60 transition-colors shrink-0">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                </button>
              )}
            </div>
            {/* Rounded container for folder content */}
            <div 
              className="w-full max-h-[75vh] bg-white/[0.12] backdrop-blur-3xl border border-white/20 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden transform animate-scaleIn"
            >
            <div className="flex-1 overflow-y-auto w-full px-1 sm:px-6 md:px-10 lg:px-14 py-6 sm:py-10 no-scrollbar">
              <SortableContext items={folderItemIds} strategy={rectSortingStrategy}>
                <div 
                  className="folder-icon-grid grid content-start"
                  style={{ maxWidth: '900px', margin: '0 auto', justifyContent: 'center', justifyItems: 'center' }}
                >
                  {openedFolder.children?.map(item => (
                    <SortableDesktopIcon
                      key={item.id} 
                      item={item} 
                      onClick={(node) => {
                        if (node.type === 'link' && node.url) window.open(node.url, '_blank');
                        else if (node.type === 'folder') setOpenedFolder(node);
                      }}
                      onContextMenu={(e, i) => handleContextMenu(e, i, false)}
                      activeId={activeId}
                      isFolderDropPending={isFolderDropPending}
                    />
                  ))}
                  <AddButton folderId={openedFolder.id} />
                  {(!openedFolder.children || openedFolder.children.length === 0) && (
                    <div className="col-span-full w-full text-center text-white/50 py-12">
                      {t('desktop.emptyFolder')}
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
            {/* Drop-out zone: visible only when dragging a folder item */}
            <FolderDropOutZone isActive={!!activeId && !!openedFolder?.children?.some(c => c.id === activeId)} />
            </div>
          </div>
        </div>
      )}

      {/* DragOverlay - the floating icon that follows cursor */}
      <DragOverlay dropAnimation={{
        duration: 250,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeItem ? (
          <DesktopIconContent item={activeItem} isOverlay isDock={false} />
        ) : null}
      </DragOverlay>

      {/* Modals */}
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} initialTab={settingsInitialTab} />}
      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
      {isProfileOpen && <ProfileModal onClose={() => setIsProfileOpen(false)} />}
      {isBookmarkBrowserOpen && <BookmarkBrowser onClose={() => setIsBookmarkBrowserOpen(false)} />}
      {isExploreOpen && <ExploreWorld onClose={() => setIsExploreOpen(false)} />}
      {isAddModalOpen && <AddItemModal 
        onClose={() => { setIsAddModalOpen(false); setEditingItem(null); setAddToFolderId(undefined); setAddToPageIndex(undefined); }}
        editItem={editingItem}
        parentFolderId={addToFolderId}
        pageIndex={addToPageIndex}
      />}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div 
            className="fixed z-[210] context-menu-glass rounded-[14px] py-1.5 min-w-[180px] animate-scaleIn"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 200) }}
          >
            {contextMenu.item.type !== 'app' && (
              <>
                <button 
                  className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                  onClick={() => handleEdit(contextMenu.item)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  {t('desktop.editItem')}
                </button>
                <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
              </>
            )}
            
            {contextMenu.inDock ? (
              <button 
                className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                onClick={() => { moveItemFromDock(contextMenu.item.id); setContextMenu(null); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                {t('desktop.removeFromDock')}
              </button>
            ) : (
              <button 
                className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                onClick={() => { moveItemToDock(contextMenu.item.id); setContextMenu(null); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                {t('desktop.moveToDock')}
              </button>
            )}

            {contextMenu.item.type !== 'app' && (
              <>
                <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
                <button 
                  className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-red-500/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                  onClick={() => handleDelete(contextMenu.item)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  {t('desktop.deleteItem')}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Blank Area Context Menu */}
      {blankContextMenu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setBlankContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setBlankContextMenu(null); }} />
          <div 
            className="fixed z-[210] context-menu-glass rounded-[14px] py-1.5 min-w-[200px] animate-scaleIn"
            style={{ left: Math.min(blankContextMenu.x, window.innerWidth - 220), top: Math.min(blankContextMenu.y, window.innerHeight - 200) }}
          >
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); openAddModal(currentPage, undefined); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              {t('desktop.addLink')}
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsAddModalOpen(true); setAddToPageIndex(currentPage); setEditingItem({ id: '', type: 'folder', title: '' }); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              {t('desktop.addFolder')}
            </button>
            <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsBookmarkBrowserOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
              {t('desktop.openBookmarks')}
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsExploreOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
              {t('explore.title')}
            </button>
            <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setSettingsInitialTab('wallpaper'); setIsSettingsOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M2 10h20"/><path d="M10 2v8"/></svg>
              {t('desktop.wallpaperSettings')}
            </button>
          </div>
        </>
      )}

      {/* Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.25s ease-out forwards; }
        .animate-scaleIn { animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .fade-in { animation: fadeIn 0.15s ease-out forwards; }
      `}} />
    </div>
    </DndContext>
  );
};
