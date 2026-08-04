import React, { FC, Fragment, ReactNode } from 'react';
import { cn } from '@bem-react/classname';

import {
	InlinePart,
	parseSimpleMarkdown,
	SimpleMarkdownBlock,
} from './parseSimpleMarkdown';

import './SimpleMarkdown.css';

export const cnSimpleMarkdown = cn('SimpleMarkdown');

const renderInline = (parts: InlinePart[], keyPrefix: string): ReactNode[] =>
	parts.map((part, index) => {
		const key = `${keyPrefix}-${index}`;
		if (part.type === 'bold') {
			return <strong key={key}>{part.value}</strong>;
		}
		if (part.type === 'italic') {
			return <em key={key}>{part.value}</em>;
		}
		return <Fragment key={key}>{part.value}</Fragment>;
	});

const renderBlock = (block: SimpleMarkdownBlock, blockIndex: number): ReactNode => {
	if (block.type === 'list') {
		return (
			<ul key={`list-${blockIndex}`} className={cnSimpleMarkdown('List')}>
				{block.items.map((item, itemIndex) => (
					<li key={`item-${blockIndex}-${itemIndex}`}>
						{renderInline(item, `li-${blockIndex}-${itemIndex}`)}
					</li>
				))}
			</ul>
		);
	}

	return (
		<p key={`p-${blockIndex}`} className={cnSimpleMarkdown('Paragraph')}>
			{block.lines.map((line, lineIndex) => (
				<Fragment key={`line-${blockIndex}-${lineIndex}`}>
					{lineIndex > 0 && <br />}
					{renderInline(line, `p-${blockIndex}-${lineIndex}`)}
				</Fragment>
			))}
		</p>
	);
};

export type SimpleMarkdownProps = {
	text: string;
	className?: string;
};

/**
 * Renders a tiny markdown subset: **bold**, *italic*, and `*` / `-` list lines.
 * Output is React nodes only (no HTML string injection).
 */
export const SimpleMarkdown: FC<SimpleMarkdownProps> = ({ text, className }) => {
	const blocks = parseSimpleMarkdown(text);

	return (
		<div className={cnSimpleMarkdown(null, [className])}>
			{blocks.map((block, index) => renderBlock(block, index))}
		</div>
	);
};
