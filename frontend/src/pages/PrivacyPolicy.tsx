import React, { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from '../i18n/useTranslation';
import { useConfigStore } from '../store/configStore';

const mdComponents = {
  h1: ({ children }: any) => <h1 className="text-3xl font-bold text-white mb-6 border-b border-white/10 pb-4">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-semibold text-white/90 mt-8 mb-4">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-semibold text-white/80 mt-6 mb-3">{children}</h3>,
  p: ({ children }: any) => <p className="text-white/70 leading-relaxed mb-4">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside space-y-2 mb-4 text-white/70">{children}</ul>,
  li: ({ children }: any) => <li className="pl-2">{children}</li>,
  a: ({ href, children }: any) => <a href={href} className="text-[#72d565] hover:underline" target="_blank" rel="noreferrer">{children}</a>,
  strong: ({ children }: any) => <strong className="font-semibold text-white/90">{children}</strong>,
  table: ({ children }: any) => <div className="overflow-x-auto mb-6 rounded-xl border border-white/10"><table className="w-full text-left border-collapse">{children}</table></div>,
  thead: ({ children }: any) => <thead className="bg-white/[0.03] border-b border-white/10">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-white/5">{children}</tbody>,
  tr: ({ children }: any) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
  th: ({ children }: any) => <th className="px-6 py-4 font-semibold text-white/90 whitespace-nowrap">{children}</th>,
  td: ({ children }: any) => <td className="px-6 py-4 text-white/70 align-top leading-relaxed">{children}</td>,
};

export const PrivacyPolicy: React.FC = () => {
  const [content, setContent] = useState('');
  const { language } = useTranslation();
  const setLanguage = useConfigStore(state => state.setLanguage);
  const isZh = language === 'zh';

  useEffect(() => {
    const privacyFile = isZh ? '/privacy_zh.md' : '/privacy.md';
    fetch(privacyFile)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      })
      .then(res => res.text())
      .then(text => setContent(text))
      .catch(err => {
        console.error('Failed to load privacy policy:', err);
        setContent(isZh ? '加载失败，请稍后重试。' : 'Failed to load, please try again later.');
      });
  }, [isZh]);

  return (
    <div className="relative h-full w-full overflow-y-auto wp-scrollbar px-4 py-12 flex justify-center bg-transparent">
      <button 
        onClick={() => setLanguage(isZh ? 'en' : 'zh')}
        className="fixed top-6 right-6 z-50 px-4 py-2 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 hover:bg-white/20 text-white/70 transition-all text-sm font-medium shadow-lg"
      >
        {isZh ? 'English' : '中文'}
      </button>

      <div className="w-full max-w-3xl bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-12 shadow-2xl animate-fadeIn my-auto">
        <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {content}
        </Markdown>
        
        <div className="mt-12 pt-8 border-t border-white/10 flex justify-center">
          <button 
            onClick={() => {
              if (window.location.protocol.includes('chrome-extension')) {
                window.location.hash = '#/';
              } else {
                window.location.href = '/';
              }
            }}
            className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-all text-sm font-medium"
          >
            {isZh ? '返回首页' : 'Back to Home'}
          </button>
        </div>
      </div>
    </div>
  );
};
