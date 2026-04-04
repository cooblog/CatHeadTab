import React, { useEffect, useMemo } from 'react';
import { useBookmarkStore, getAllFolders, getFolderItemCount, findNodeById, ChromeBookmarkTreeNode } from '../store/bookmarkStore';
import { getSmartFaviconUrl, cacheImageFromElement } from '../utils/favicon';

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);

const FolderIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? "currentColor" : "currentColor"} stroke="transparent" className={active ? "text-white" : "text-[#72d565]"}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
);

const ClockIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? "currentColor" : "currentColor"} stroke="transparent" className={active ? "text-white" : "text-[#72d565]"}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.2 14.2L11 11.3V7h1.5v3.8l4.7 4.9-1 1.5z"/></svg>
);

const GlobeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
);

export const Bookmarks: React.FC = () => {
  const { 
    bookmarksTree, 
    recentBookmarks, 
    activeFolderId, 
    searchQuery,
    fetchBookmarks, 
    setActiveFolder,
    setSearchQuery,
    deleteBookmark
  } = useBookmarkStore();

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const allFolders = useMemo(() => getAllFolders(bookmarksTree), [bookmarksTree]);

  // Compute the current items to show in the right pane
  const currentItems = useMemo(() => {
    let items: ChromeBookmarkTreeNode[] = [];
    
    if (activeFolderId === 'recent') {
      items = recentBookmarks;
    } else {
      const activeFolder = findNodeById(bookmarksTree, activeFolderId);
      if (activeFolder && activeFolder.children) {
        items = activeFolder.children;
      }
    }

    // Filter by search query within the current folder
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      // If searching, we might prefer to search globally, but let's stick to current folder for now
      // Global search would require searching the whole tree
      // For global search: items = getAllBookmarks(bookmarksTree).filter(b => b.title.includes(query))
      items = items.filter(item => 
        item.title?.toLowerCase().includes(query) || 
        item.url?.toLowerCase().includes(query)
      );
    }

    return items;
  }, [bookmarksTree, recentBookmarks, activeFolderId, searchQuery]);

  return (
    <div className="flex w-full h-[calc(100vh)] bg-black/90">
      
      {/* Left Sidebar - Folders */}
      <aside className="w-64 min-w-[256px] border-r border-white/5 flex flex-col h-full bg-[#111111]">
        
        {/* Top Controls Area */}
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <button className="w-6 h-6 rounded-full bg-orange-500/80 hover:bg-orange-500 flex items-center justify-center text-[10px] text-black">
              <span className="opacity-0 hover:opacity-100">✖</span>
            </button>
            <button className="w-6 h-6 rounded-full bg-green-500/80 hover:bg-green-500 flex items-center justify-center text-[10px] text-black">
              <span className="opacity-0 hover:opacity-100">↗</span>
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-white/40">
              <SearchIcon />
            </div>
            <input 
              type="text" 
              placeholder="搜索书签" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-[#72d565]/50 transition-shadow"
            />
          </div>
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto px-3 pb-6 flex flex-col gap-1 custom-scrollbar">
          
          {/* Recently Added Special Item */}
          <button
            onClick={() => setActiveFolder('recent')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors
              ${activeFolderId === 'recent' 
                ? 'bg-[#72d565] text-black font-semibold shadow-sm' 
                : 'text-white/80 hover:bg-white/5'
              }`}
          >
            <div className="flex items-center gap-3">
              <ClockIcon active={activeFolderId === 'recent'} />
              <span className="text-[15px]">最近添加</span>
            </div>
            <span className={`text-[13px] ${activeFolderId === 'recent' ? 'text-black/60' : 'text-white/30'}`}>
              {recentBookmarks.length}
            </span>
          </button>

          {/* Dynamic Folders */}
          {allFolders.map(folder => {
            const count = getFolderItemCount(folder);
            const isActive = activeFolderId === folder.id;
            
            return (
              <button
                key={folder.id}
                onClick={() => setActiveFolder(folder.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors
                  ${isActive
                    ? 'bg-[#72d565] text-black font-semibold shadow-sm' 
                    : 'text-white/80 hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-3 truncate pr-2">
                  <div className="shrink-0"><FolderIcon active={isActive} /></div>
                  <span className="text-[15px] truncate">{folder.title || 'Untitled'}</span>
                </div>
                <span className={`text-[13px] shrink-0 ${isActive ? 'text-black/60' : 'text-white/30'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Right Main Area - Bookmarks */}
      <main className="flex-1 overflow-y-auto p-6 bg-[#212121] my-4 mr-4 rounded-xl border border-white/5 shadow-2xl relative custom-scrollbar">
        
        <div className="max-w-4xl mx-auto space-y-2 pb-12">
          
          {currentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/40 space-y-4">
              <p>📭</p>
              <p>这个文件夹是空的</p>
            </div>
          ) : (
            currentItems.map(item => {
              // If it's a folder mixed with links, render differently (or recursive, but user only showed flat list of links)
              // We'll just differentiate style based on URL
              const isLink = !!item.url;
              
              return (
                <a
                  key={item.id}
                  href={item.url || '#'}
                  target={isLink ? "_blank" : undefined}
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!isLink) {
                      e.preventDefault();
                      setActiveFolder(item.id);
                    }
                  }}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between py-3 px-4 hover:bg-white-[0.03] rounded-xl transition-all border border-transparent hover:border-white/5"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Favicon / Icon */}
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10 overflow-hidden relative">
                      {isLink && item.url ? (
                        <img 
                          src={getSmartFaviconUrl(item.url, 64)}
                          className="w-5 h-5 object-contain"
                          alt=""
                          onLoad={(e) => cacheImageFromElement(e.currentTarget, item.url!, 64)}
                          onError={(e) => {
                            // Fallback if favicon fails
                            e.currentTarget.style.display = 'none';
                            const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                            if (sibling) sibling.style.display = 'flex';
                          }}
                        />
                      ) : (
                        <FolderIcon />
                      )}
                      {/* Fallback Globe Icon */}
                      <div className="absolute inset-0 items-center justify-center hidden">
                        <GlobeIcon />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex flex-col truncate flex-1 pr-6">
                      <span className="text-[15px] font-medium text-white/90 truncate group-hover:text-white transition-colors">
                        {item.title || item.url || 'Untitled'}
                      </span>
                      {isLink && (
                        <span className="text-xs text-white/40 truncate mt-0.5">
                          {item.url}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions / Info */}
                  <div className="flex items-center gap-3 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity mt-2 sm:mt-0">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        deleteBookmark(item.id);
                      }}
                      className="p-1.5 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                      title="Delete Bookmark"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                    {item.dateAdded && (
                      <span className="text-xs text-white/30 hidden md:block">
                        {new Date(item.dateAdded).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </a>
              );
            })
          )}
        </div>
        
        {/* Decorative corner element to match the bottom-right grid in screenshot */}
        <div className="absolute bottom-4 right-4 w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center pointer-events-none opacity-50">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
          </div>
        </div>

      </main>
      
      {/* Required CSS for custom scrollbar hidden in normal tailwind */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.2);
        }
      `}} />

    </div>
  );
};
