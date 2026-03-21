import { create } from 'zustand';

// Minimal type definition to allow for local development outside extension
export interface ChromeBookmarkTreeNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  unmodifiable?: string;
  children?: ChromeBookmarkTreeNode[];
}

interface BookmarkState {
  bookmarksTree: ChromeBookmarkTreeNode[];
  recentBookmarks: ChromeBookmarkTreeNode[];
  activeFolderId: string;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  fetchBookmarks: () => Promise<void>;
  setActiveFolder: (id: string) => void;
  setSearchQuery: (query: string) => void;
  deleteBookmark: (id: string) => Promise<void>;
}

// Mock data for local testing outside of Chrome Extension context
const mockTree: ChromeBookmarkTreeNode[] = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        parentId: "0",
        title: "书签栏",
        children: [
          { id: "101", parentId: "1", title: "GitHub", url: "https://github.com" },
          { id: "102", parentId: "1", title: "React", url: "https://reactjs.org" },
        ]
      },
      {
        id: "2",
        parentId: "0",
        title: "其他书签",
        children: [
          {
            id: "201",
            parentId: "2",
            title: "好文",
            children: [
              { id: "301", parentId: "201", title: "Tailwind CSS", url: "https://tailwindcss.com" }
            ]
          }
        ]
      }
    ]
  }
];

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarksTree: [],
  recentBookmarks: [],
  activeFolderId: 'recent', // 'recent' or folder id
  searchQuery: '',
  loading: false,
  error: null,

  fetchBookmarks: async () => {
    set({ loading: true, error: null });
    try {
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        // Run in Chrome Extension
        chrome.bookmarks.getTree((tree) => {
          chrome.bookmarks.getRecent(50, (recent) => {
            set({ 
              bookmarksTree: tree, 
              recentBookmarks: recent,
              loading: false 
            });
          });
        });
      } else {
        // Mock data fallback
        set({ 
          bookmarksTree: mockTree, 
          recentBookmarks: [
            { id: "301", title: "Tailwind CSS", url: "https://tailwindcss.com" },
            { id: "101", title: "GitHub", url: "https://github.com" }
          ],
          loading: false 
        });
      }
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  setActiveFolder: (id: string) => {
    set({ activeFolderId: id, searchQuery: '' }); // Clear search on folder change
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  deleteBookmark: async (id: string) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        chrome.bookmarks.remove(id, () => {
          // Re-fetch tree after delete to stay sync
          get().fetchBookmarks();
        });
      } else {
        // Naive mock delete for UI consistency
        set(state => ({
          recentBookmarks: state.recentBookmarks.filter(b => b.id !== id)
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  }
}));

// Helper to extract a flat list of all folders
export const getAllFolders = (nodes: ChromeBookmarkTreeNode[]): ChromeBookmarkTreeNode[] => {
  let folders: ChromeBookmarkTreeNode[] = [];
  for (const node of nodes) {
    if (!node.url) { // Undefined URL means it's a folder
      // Skip the root unnamed node usually ID "0"
      if (node.title !== "") {
        folders.push(node);
      }
      if (node.children) {
        folders = folders.concat(getAllFolders(node.children));
      }
    }
  }
  return folders;
};

// Helper to recursively count items in a folder
export const getFolderItemCount = (node: ChromeBookmarkTreeNode): number => {
  if (!node.children) return 0;
  let count = 0;
  for (const child of node.children) {
    if (child.url) {
      count++;
    } else {
      count += getFolderItemCount(child);
    }
  }
  return count;
};

// Helper to find a specific node by ID
export const findNodeById = (nodes: ChromeBookmarkTreeNode[], id: string): ChromeBookmarkTreeNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
};
