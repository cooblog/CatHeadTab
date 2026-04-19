import React, { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from '../i18n/useTranslation';

const mdComponents = {
  h1: ({ children }: any) => <h1 className="text-3xl font-bold text-white mb-6 border-b border-white/10 pb-4">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-semibold text-white/90 mt-8 mb-4">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-semibold text-white/80 mt-6 mb-3">{children}</h3>,
  p: ({ children }: any) => <p className="text-white/70 leading-relaxed mb-4">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside space-y-2 mb-4 text-white/70">{children}</ul>,
  li: ({ children }: any) => <li className="pl-2">{children}</li>,
  a: ({ href, children }: any) => <a href={href} className="text-[#72d565] hover:underline" target="_blank" rel="noreferrer">{children}</a>,
  strong: ({ children }: any) => <strong className="font-semibold text-white/90">{children}</strong>,
};

export const PrivacyPolicy: React.FC = () => {
  const [content, setContent] = useState('');
  const { language } = useTranslation();
  const isZh = language === 'zh';

  useEffect(() => {
    fetch('/privacy.md')
      .then(res => res.text())
      .then(text => setContent(text))
      .catch(err => {
        console.error('Failed to load privacy policy:', err);
        setContent(isZh ? '加载失败，请稍后重试。' : 'Failed to load, please try again later.');
      });
  }, [isZh]);

  return (
    <div className="h-full w-full overflow-y-auto wp-scrollbar px-4 py-12 flex justify-center bg-transparent">
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
