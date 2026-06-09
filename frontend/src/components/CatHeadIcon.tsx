import React from 'react';

export const CAT_HEAD_ICON_SRC = '/icon-128.png';

interface CatHeadIconProps {
  className?: string;
  imageClassName?: string;
  alt?: string;
  style?: React.CSSProperties;
}

export const CatHeadIcon: React.FC<CatHeadIconProps> = ({
  className = '',
  imageClassName = '',
  alt = 'CatHeadTab',
  style,
}) => (
  <span className={`inline-flex items-center justify-center overflow-hidden ${className}`} style={style}>
    <img
      src={CAT_HEAD_ICON_SRC}
      alt={alt}
      draggable={false}
      className={`w-full h-full object-contain ${imageClassName}`}
    />
  </span>
);
