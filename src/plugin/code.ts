figma.showUI(__html__, { width: 320, height: 240 });

figma.ui.onmessage = (msg: { type: string; count?: number }) => {
  if (msg.type === 'create-rectangles') {
    const count = msg.count ?? 5;
    const nodes: SceneNode[] = [];
    for (let i = 0; i < count; i++) {
      const rect = figma.createRectangle();
      rect.x = i * 160;
      rect.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.9 } }];
      figma.currentPage.appendChild(rect);
      nodes.push(rect);
    }
    figma.currentPage.selection = nodes;
    figma.viewport.scrollAndZoomIntoView(nodes);
    figma.notify(`Created ${count} rectangle(s)`);
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};
