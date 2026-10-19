mg.showUI(__html__, { width: 420, height: 500 });

mg.ui.onmessage = async (msg) => {
  // 处理全局轻提示
  if (msg.type === 'notify') {
    mg.notify(msg.message);
    return;
  }

  if (msg.type === 'extract-canvas-svg') {
    const selection = mg.document.currentPage.selection;

    if (selection.length === 0) {
      mg.notify('⚠️ 请先在画布中选中至少一个节点');
      return;
    }

    try {
      const results = [];
      mg.notify(`正在提取 ${selection.length} 个图标，请稍候...`);

      for (const node of selection) {
        // MasterGo 导出 SVG 实际上直接返回的就是 string！
        const exported = await node.exportAsync({ format: 'SVG' }) as any;

        let svgText = '';
        if (typeof exported === 'string') {
          svgText = exported;
        } else if (exported instanceof Uint8Array) {
          // 仅做极端情况兼容
          svgText = new TextDecoder('utf-8').decode(exported);
        }

        console.log(`[插件后台] 成功提取 "${node.name}", SVG 长度:`, svgText.length);

        results.push({
          name: node.name || 'icon',
          svgText: svgText,
          width: node.width || 24,
          height: node.height || 24
        });
      }

      mg.ui.postMessage({ type: 'selection-svg-result', items: results });
    } catch (e: any) {
      console.error('提取失败:', e);
      mg.notify(`提取失败: ${e.message}`);
    }
    return;
  }

  // 接收前端发来的指令，在画布中直接生成并插入单个图标
  if (msg.type === 'insert-single-icon') {
    try {
      const svgString = msg.svgContent;
      const iconName = msg.name || 'icon';

      const CELL_SIZE = 88;
      const ICON_SIZE = 64;

      const cardFrame = mg.createFrame();
      cardFrame.name = iconName;
      cardFrame.resize(CELL_SIZE, CELL_SIZE);
      cardFrame.cornerRadius = 12;
      cardFrame.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.93, b: 0.94, a: 1 } }];

      // 放置在当前视口中心
      const center = mg.viewport ? mg.viewport.center : { x: 0, y: 0 };
      cardFrame.x = center.x - CELL_SIZE / 2;
      cardFrame.y = center.y - CELL_SIZE / 2;

      mg.document.currentPage.appendChild(cardFrame);

      const iconNode = await mg.createNodeFromSvgAsync(svgString);
      iconNode.name = iconName;
      cardFrame.appendChild(iconNode);

      iconNode.x = (CELL_SIZE - ICON_SIZE) / 2;
      iconNode.y = (CELL_SIZE - ICON_SIZE) / 2;

      mg.document.currentPage.selection = [cardFrame];
      mg.notify(`成功插入图标: ${iconName}`);
    } catch (e: any) {
      mg.notify(`插入失败: ${e.message}`);
    }
  }
};