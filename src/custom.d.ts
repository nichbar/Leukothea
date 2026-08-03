declare module "*.svg" {
	const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
	export default ReactComponent;
}

declare module "*.svg?raw" {
	const content: string;
	export default content;
}

declare module "*.txt" {
	const content: string;
	export default content;
}
