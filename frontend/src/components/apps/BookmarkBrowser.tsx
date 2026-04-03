import React, { useState, useEffect } from 'react';
import { useBookmarkStore, ChromeBookmarkTreeNode, getFolderItemCount, getAllBookmarks } from '../../store/bookmarkStore';
import { useTranslation } from '../../i18n/useTranslation';
import { getSmartFaviconUrl } from '../../utils/favicon';

export const BookmarkBrowser: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { bookmarksTree, fetchBookmarks, deleteBookmark } = useBookmarkStore();
  const { t } = useTranslation();
  const [activeFolderId, setActiveFolderId] = useState<string>('1'); // Default to Bookmarks Bar
  const [activeFolderPaths, setActiveFolderPaths] = useState<ChromeBookmarkTreeNode[]>([]);
  const [currentChildren, setCurrentChildren] = useState<ChromeBookmarkTreeNode[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  useEffect(() => {
    if (!bookmarksTree || bookmarksTree.length === 0) return;
    
    // Special handling for "All Bookmarks"
    if (activeFolderId === 'all') {
      setActiveFolderPaths([]);
      setCurrentChildren([]);
      return;
    }

    let path: ChromeBookmarkTreeNode[] = [];
    let foundChildren: ChromeBookmarkTreeNode[] = [];

    const findFolder = (nodes: ChromeBookmarkTreeNode[], targetId: string, currentPath: ChromeBookmarkTreeNode[]): boolean => {
      for (const node of nodes) {
        if (node.id === targetId) {
          path = [...currentPath, node];
          foundChildren = node.children || [];
          return true;
        }
        if (node.children) {
          if (findFolder(node.children, targetId, [...currentPath, node])) {
            return true;
          }
        }
      }
      return false;
    };

    findFolder(bookmarksTree, activeFolderId, []);
    setActiveFolderPaths(path);
    setCurrentChildren(foundChildren);
  }, [bookmarksTree, activeFolderId]);

  const handleNodeClick = (node: ChromeBookmarkTreeNode) => {
    if (!node.url) {
      setActiveFolderId(node.id);
    } else {
      window.open(node.url, '_blank');
    }
  };

  const currentFolder = activeFolderPaths[activeFolderPaths.length - 1];

  const filteredChildren = (() => {
    // When "All Bookmarks" is selected, search from the entire tree
    if (activeFolderId === 'all') {
      const allItems = getAllBookmarks(bookmarksTree);
      if (!searchQuery.trim()) return allItems;
      const q = searchQuery.toLowerCase();
      return allItems.filter(child =>
        child.title?.toLowerCase().includes(q) || child.url?.toLowerCase().includes(q)
      );
    }
    // Normal folder filtering
    return currentChildren.filter(child => {
      if (!searchQuery.trim()) return true;
      return child.title?.toLowerCase().includes(searchQuery.toLowerCase()) || child.url?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4 sm:p-12" onContextMenu={(e) => e.preventDefault()}>
      {/* Dimmed Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity"
        onClick={onClose}
      />

      {/* App Window container */}
      <div 
        className={`bg-black/30 backdrop-blur-xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-[800px] h-[80vh] md:h-[75vh] rounded-[1.5rem] md:rounded-[2rem]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none absolute top-0 left-0 right-0 z-20">
          {/* Left: Mac traffic lights on desktop, hamburger on mobile */}
          <div className="flex items-center gap-2 w-auto md:w-24">
            {/* Mobile: hamburger + close */}
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
            </button>
            {/* Desktop: traffic lights */}
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button onClick={() => setIsFullScreen(!isFullScreen)} className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              </button>
            </div>
          </div>
          
          <div className="flex-1 flex justify-center drag-region cursor-move opacity-60 hover:opacity-100 transition-opacity min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] md:text-[13px] font-medium text-white/70 truncate max-w-full overflow-hidden">
              {activeFolderId === 'all' ? (
                <span className="text-white font-bold drop-shadow-md truncate">{t('bookmark.allBookmarks')}</span>
              ) : (
                activeFolderPaths.map((p, idx) => (
                  <React.Fragment key={p.id}>
                    {idx > 0 && <span className="text-white/30 text-[10px] shrink-0">&#9654;</span>}
                    <span className={`truncate ${idx === activeFolderPaths.length - 1 ? 'text-white font-bold drop-shadow-md' : 'cursor-pointer hover:text-white transition-colors'}`} onClick={() => setActiveFolderId(p.id)}>
                      {p.title || t('bookmark.root')}
                    </span>
                  </React.Fragment>
                ))
              )}
            </div>
          </div>
          
          {/* Mobile close button on right */}
          <div className="flex items-center w-auto md:w-24 justify-end">
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-24" /> {/* Desktop spacer */}
          </div>
        </div>

        {/* Browser Body */}
        <div className="flex-1 flex overflow-hidden mt-12 md:mt-14 relative">
          <div className="absolute inset-0 border-t border-white/5 pointer-events-none" />
          
          {/* Mobile sidebar overlay */}
          {showSidebar && (
            <div className="absolute inset-0 z-30 md:hidden" onClick={() => setShowSidebar(false)}>
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#1c1c1e]/90 backdrop-blur-[64px] border-r border-white/10 flex flex-col z-40 animate-slideIn" onClick={e => e.stopPropagation()}>
                {/* Search */}
                <div className="p-4 pb-2">
                  <div className="relative">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={activeFolderId === 'all' ? t('bookmark.searchAll') : t('bookmark.search')}
                      className="w-full bg-[#202324] border border-white/10 focus:border-[#72d565]/50 hover:bg-[#2a2e30] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white/90 placeholder-white/30 outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>
                {/* Folder list */}
                <div className="flex-1 overflow-y-auto no-scrollbar pl-4 pr-3 pb-8 pt-3 space-y-1">
                  {/* All Bookmarks */}
                  <div className="mb-4">
                    <button 
                      onClick={() => { setActiveFolderId('all'); setShowSidebar(false); }}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeFolderId === 'all' ? 'bg-[#72d565] text-black shadow-lg shadow-[#72d565]/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${activeFolderId === 'all' ? 'text-black/80' : 'text-white/40 group-hover:text-[#72d565]'}`}><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
                        <span className="text-[14px] font-medium truncate">{t('bookmark.allBookmarks')}</span>
                      </div>
                      <span className={`text-[12px] font-semibold ${activeFolderId === 'all' ? 'text-black/60' : 'text-white/30'}`}>{getAllBookmarks(bookmarksTree).length}</span>
                    </button>
                  </div>
                  {bookmarksTree?.[0]?.children?.map((rootFolder: ChromeBookmarkTreeNode) => (
                    <div key={rootFolder.id} className="mb-4">
                      <div className="px-3 text-[11px] font-bold text-white/30 uppercase tracking-widest mb-1.5">{rootFolder.title}</div>
                      <button 
                        onClick={() => { setActiveFolderId(rootFolder.id); setShowSidebar(false); }}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeFolderId === rootFolder.id ? 'bg-[#72d565] text-black shadow-lg shadow-[#72d565]/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${activeFolderId === rootFolder.id ? 'text-black/80' : 'text-white/40 group-hover:text-[#72d565]'}`}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          <span className="text-[14px] font-medium truncate">{rootFolder.title}</span>
                        </div>
                        <span className={`text-[12px] font-semibold ${activeFolderId === rootFolder.id ? 'text-black/60' : 'text-white/30'}`}>{getFolderItemCount(rootFolder)}</span>
                      </button>
                      <div className="ml-3 border-l border-white/5 pl-2 mt-1 space-y-0.5">
                        {rootFolder.children?.filter((c: ChromeBookmarkTreeNode) => !c.url).map((sub: ChromeBookmarkTreeNode) => (
                          <button 
                            key={sub.id}
                            onClick={() => { setActiveFolderId(sub.id); setShowSidebar(false); }}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeFolderId === sub.id ? 'bg-[#72d565] text-black shadow-lg shadow-[#72d565]/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${activeFolderId === sub.id ? 'text-black/80' : 'text-white/40 group-hover:text-[#72d565]'}`}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                              <span className="flex-1 font-medium text-left truncate">{sub.title}</span>
                            </div>
                            <span className={`text-[12px] font-semibold ${activeFolderId === sub.id ? 'text-black/60' : 'text-white/30'}`}>{getFolderItemCount(sub)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Desktop Sidebar */}
          <div className="window-sidebar hidden md:flex w-[240px] border-r border-white/10 flex-col shrink-0 relative z-10">
            {/* Search Area */}
            <div className="p-5 pb-2">
              <div className="relative">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={activeFolderId === 'all' ? t('bookmark.searchAll') : t('bookmark.search')}
                  className="w-full bg-[#202324] border border-white/10 focus:border-[#72d565]/50 hover:bg-[#2a2e30] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white/90 placeholder-white/30 outline-none transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Folder List */}
            <div className="flex-1 overflow-y-auto no-scrollbar pl-5 pr-3 pb-8 pt-3 space-y-1">
              {/* All Bookmarks */}
              <div className="mb-4">
                <button 
                  onClick={() => setActiveFolderId('all')}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeFolderId === 'all' ? 'bg-[#72d565] text-black shadow-lg shadow-[#72d565]/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${activeFolderId === 'all' ? 'text-black/80' : 'text-white/40 group-hover:text-[#72d565]'}`}><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
                    <span className="text-[14px] font-medium truncate">{t('bookmark.allBookmarks')}</span>
                  </div>
                  <span className={`text-[12px] font-semibold ${activeFolderId === 'all' ? 'text-black/60' : 'text-white/30 group-hover:text-white/50'}`}>
                    {getAllBookmarks(bookmarksTree).length}
                  </span>
                </button>
              </div>
              {bookmarksTree?.[0]?.children?.map((rootFolder: ChromeBookmarkTreeNode) => (
                <div key={rootFolder.id} className="mb-4">
                  <div className="px-3 text-[11px] font-bold text-white/30 uppercase tracking-widest mb-1.5">{rootFolder.title}</div>
                  
                  {/* The Root Folder Itself */}
                  <button 
                    onClick={() => setActiveFolderId(rootFolder.id)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeFolderId === rootFolder.id ? 'bg-[#72d565] text-black shadow-lg shadow-[#72d565]/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${activeFolderId === rootFolder.id ? 'text-black/80' : 'text-white/40 group-hover:text-[#72d565]'}`}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      <span className="text-[14px] font-medium truncate">{rootFolder.title}</span>
                    </div>
                    <span className={`text-[12px] font-semibold ${activeFolderId === rootFolder.id ? 'text-black/60' : 'text-white/30 group-hover:text-white/50'}`}>
                      {getFolderItemCount(rootFolder)}
                    </span>
                  </button>

                  {/* Immediate Children Folders */}
                  <div className="ml-3 border-l border-white/5 pl-2 mt-1 space-y-0.5">
                    {rootFolder.children?.filter((c: ChromeBookmarkTreeNode) => !c.url).map((sub: ChromeBookmarkTreeNode) => (
                      <button 
                        key={sub.id}
                        onClick={() => setActiveFolderId(sub.id)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeFolderId === sub.id ? 'bg-[#72d565] text-black shadow-lg shadow-[#72d565]/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${activeFolderId === sub.id ? 'text-black/80' : 'text-white/40 group-hover:text-[#72d565]'}`}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          <span className="flex-1 font-medium text-left truncate">{sub.title}</span>
                        </div>
                        <span className={`text-[12px] font-semibold ${activeFolderId === sub.id ? 'text-black/60' : 'text-white/30 group-hover:text-white/50'}`}>
                          {getFolderItemCount(sub)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Main List View */}
          <div className="window-content flex-1 overflow-y-auto">
            {/* Mobile: inline search */}
            <div className="md:hidden p-3 pb-0">
              <div className="relative">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={activeFolderId === 'all' ? t('bookmark.searchAll') : t('bookmark.search')}
                  className="w-full bg-[#202324] border border-white/10 focus:border-[#72d565]/50 hover:bg-[#2a2e30] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white/90 placeholder-white/30 outline-none transition-all shadow-inner"
                />
              </div>
            </div>
            <div className="p-4 md:p-6">
              
              <div className="flex items-center justify-between mb-3 md:mb-4 pb-3 border-b border-white/10 pl-1">
                <h1 className="text-base md:text-xl font-bold text-white tracking-tight flex items-center gap-3">
                  {activeFolderId === 'all' ? t('bookmark.allBookmarks') : (currentFolder?.title || t('bookmark.bookmarks'))}
                </h1>
                <span className="text-white/40 text-[12px] md:text-[13px] font-medium bg-white/5 px-2.5 md:px-3 py-0.5 md:py-1 rounded-full">{filteredChildren.length} {t('bookmark.items')}</span>
              </div>

              {filteredChildren.length > 0 ? (
                <div className="flex flex-col gap-1 w-full">
                  {filteredChildren.map(item => (
                    <div 
                      key={item.id} 
                      className="bookmark-row flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer border border-transparent hover:border-white/5 active:scale-[0.99]"
                      onClick={() => handleNodeClick(item)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden">
                          {item.url ? (
                            <img 
                              src={getSmartFaviconUrl(item.url, 64)} 
                              alt="" 
                              className="w-4.5 h-4.5 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px]">🌐</span>';
                              }}
                            />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" className="text-white/90"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[13px] font-semibold text-white/90 truncate bookmark-title transition-colors">
                            {item.title || (item.url ? new URL(item.url).hostname : t('bookmark.untitled'))}
                          </span>
                          {item.url && (
                            <span className="text-[11px] text-white/30 truncate mt-0.5">
                              {item.url}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons (Hover) */}
                      <div className="bookmark-actions flex items-center gap-1.5 shrink-0 ml-2">
                        {item.url && (
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               navigator.clipboard.writeText(item.url!);
                             }}
                             className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/20 text-white/50 hover:text-white flex items-center justify-center transition-colors"
                             title={t('bookmark.copyUrl')}
                           >
                             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                           </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(t('bookmark.deleteConfirm', { title: item.title }))) {
                              deleteBookmark(item.id);
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-red-500/10 hover:bg-red-500/90 text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 flex items-center justify-center transition-all"
                          title={t('bookmark.deleteItem')}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full h-[60%] flex flex-col items-center justify-center text-white/20">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-6 opacity-30"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <p className="text-[15px] font-medium text-white/40">{searchQuery ? t('bookmark.noResults', { query: searchQuery }) : t('bookmark.empty')}</p>
                  <p className="text-[13px] mt-2">{t('bookmark.addHint')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

