import React, { FC } from 'react';
import { cn } from '@bem-react/classname';

// Raw SVG string: SVGR/SVGO strips nested animation styles/frames for this asset.
import nyancatSvg from './Loader.assets/nyancat.svg?raw';

import './Loader.css';

export const cnLoader = cn('Loader');

export const Loader: FC<{ className?: string }> = ({ className }) => {
	return (
		<div
			className={cnLoader('', {}, [className])}
			// Inline animated SVG (CSS keyframes + frame opacity cycle).
			dangerouslySetInnerHTML={{ __html: nyancatSvg }}
		/>
	);
};
