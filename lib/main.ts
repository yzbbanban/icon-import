mg.showUI(__html__, { width: 380, height: 460 });

mg.ui.onmessage = async (msg) => {
  if (msg.type === 'import-iconfont') {
    try {
      const data = JSON.parse(msg.json);
      const jsText = msg.svg;
      const glyphs = data.glyphs;

      if (!glyphs || glyphs.length === 0) {
        mg.notify('错误：iconfont.json 中没有找到图标数据');
        return;
      }

      const currentPage = mg.document.currentPage;
      if (!currentPage) {
        mg.notify('错误：未找到当前设计页面');
        return;
      }

      const libraryName = `Iconfont 图标库 (${data.name || 'Website'})`;

      // 【核心更新 1】查找当前页面是否已经存在同名的图标库大画板
      let mainFrame = currentPage.children.find(node => node.type === 'FRAME' && node.name === libraryName) as FrameNode;
      let isNewLibrary = false;

      // 如果不存在，则创建新的总画板
      if (!mainFrame) {
        mainFrame = mg.createFrame();
        mainFrame.name = libraryName;
        mainFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.98, a: 1 } }];
        currentPage.appendChild(mainFrame);
        isNewLibrary = true;
      }

      // 【核心更新 2】获取画板中已存在的卡片容器，存储以便比对
      const existingCards = new Map<string, FrameNode>();
      mainFrame.children.forEach(child => {
        if (child.type === 'FRAME') {
          existingCards.set(child.name, child as FrameNode);
        }
      });

      const ICON_SIZE = 64;
      const CELL_SIZE = 88;
      const GAP = 16;
      const COLS = 8;
      const PADDING = 28;

      let addedCount = 0;
      let updatedCount = 0;

      for (const item of glyphs) {
        const iconName = item.name || item.font_class;
        const fontClass = item.font_class;
        const iconId = item.icon_id;

        const svgString = extractSvgSmartFromJs(jsText, fontClass, iconId, ICON_SIZE);

        if (svgString) {
          try {
            let cardFrame = existingCards.get(iconName);

            if (cardFrame) {
              // 【核心更新 3-A】如果已存在，清空旧的 SVG 节点（替换逻辑）
              cardFrame.children.forEach(child => child.remove());
              updatedCount++;
            } else {
              // 【核心更新 3-B】如果不存在，创建新的卡片容器（新增逻辑）
              cardFrame = mg.createFrame();
              cardFrame.name = iconName;
              cardFrame.resize(CELL_SIZE, CELL_SIZE);
              cardFrame.cornerRadius = 12;
              cardFrame.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.93, b: 0.94, a: 1 } }];
              mainFrame.appendChild(cardFrame);
              addedCount++;
            }

            // 生成并挂载新的 SVG 节点
            const iconNode = await mg.createNodeFromSvgAsync(svgString);
            iconNode.name = iconName;

            applyThemeColorIfMonochrome(iconNode, { r: 0, g: 103 / 255, b: 227 / 255, a: 1 });

            cardFrame.appendChild(iconNode);

            // 让图标在卡片内居中
            iconNode.x = (CELL_SIZE - ICON_SIZE) / 2;
            iconNode.y = (CELL_SIZE - ICON_SIZE) / 2;

          } catch (svgErr) {
            console.error(`图标 ${iconName} 处理失败`, svgErr);
          }
        }
      }

      const allCards = mainFrame.children;
      if (allCards.length === 0) {
        mg.notify('导入失败：未能在文件中匹配到任何图标');
        mainFrame.remove();
        return;
      }

      // 【核心更新 4】统一重新计算所有卡片的网格位置（因为有可能混杂了新增和旧数据）
      let i = 0;
      for (const child of allCards) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        child.x = PADDING + col * (CELL_SIZE + GAP);
        child.y = PADDING + row * (CELL_SIZE + GAP);
        i++;
      }

      // 调整大画板的总宽高
      const totalRows = Math.ceil(allCards.length / COLS);
      const totalWidth = COLS * CELL_SIZE + (COLS - 1) * GAP + PADDING * 2;
      const totalHeight = totalRows * CELL_SIZE + (totalRows - 1) * GAP + PADDING * 2;
      mainFrame.resize(totalWidth, totalHeight);

      // 【核心更新 5】如果是新建画板，放置在视口中心；如果是更新已存在的，保留用户放在画布上的原有位置！
      if (isNewLibrary) {
        const startX = mg.viewport ? mg.viewport.center.x - totalWidth / 2 : 0;
        const startY = mg.viewport ? mg.viewport.center.y - totalHeight / 2 : 0;
        mainFrame.x = startX;
        mainFrame.y = startY;
      }

      currentPage.selection = [mainFrame];

      if (mg.viewport && typeof mg.viewport.scrollAndZoomIntoView === 'function') {
        mg.viewport.scrollAndZoomIntoView([mainFrame]);
      }

      mg.closePlugin(`同步完成！新增 ${addedCount} 个，更新替换 ${updatedCount} 个图标`);
    } catch (err: any) {
      console.error('导入过程发生错误:', err);
      mg.notify(`导入报错: ${err.message || err}`);
    }
  }
};

// 提取原生带有 viewBox 与宽高的 SVG 字符串
function extractSvgSmartFromJs(jsText: string, fontClass: string, iconId: string, size: number) {
  const symbolRegex = /<symbol([^>]*)id="([^"]*)"([^>]*)>([\s\S]*?)<\/symbol>/gi;
  let match;

  while ((match = symbolRegex.exec(jsText)) !== null) {
    const attrsBeforeId = match[1];
    const idAttr = match[2];
    const attrsAfterId = match[3];
    const content = match[4];

    if (
        idAttr === fontClass ||
        idAttr === `icon-${fontClass}` ||
        idAttr.includes(fontClass) ||
        idAttr === iconId ||
        idAttr.includes(iconId)
    ) {
      const allAttrs = attrsBeforeId + " " + attrsAfterId;
      const viewBoxMatch = allAttrs.match(/viewBox="([^"]+)"/i);
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 1024 1024";

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${content}</svg>`;
    }
  }

  return null;
}

// 智能单色判定及主题色替换
function applyThemeColorIfMonochrome(node: SceneNode, themeColor: { r: number, g: number, b: number, a: number }) {
  try {
    if ('children' in node) {
      let colorSet = new Set<string>();
      collectColors(node, colorSet);

      if (colorSet.size <= 2) {
        applyColorRecursively(node, themeColor);
      }
    }
  } catch (e) {
    console.warn('颜色适配失败', e);
  }
}

function collectColors(node: SceneNode, colorSet: Set<string>) {
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === 'SOLID' && fill.color) {
        if (!(fill.color.r > 0.95 && fill.color.g > 0.95 && fill.color.b > 0.95)) {
          colorSet.add(`${Math.round(fill.color.r * 255)},${Math.round(fill.color.g * 255)},${Math.round(fill.color.b * 255)}`);
        }
      }
    }
  }
  if ('children' in node) {
    for (const child of node.children) {
      collectColors(child, colorSet);
    }
  }
}

function applyColorRecursively(node: SceneNode, themeColor: { r: number, g: number, b: number, a: number }) {
  if ('fills' in node && Array.isArray(node.fills)) {
    node.fills = node.fills.map((fill: any) => {
      if (fill.type === 'SOLID') {
        if (!(fill.color.r > 0.95 && fill.color.g > 0.95 && fill.color.b > 0.95)) {
          return { ...fill, color: themeColor };
        }
      }
      return fill;
    });
  }
  if ('children' in node) {
    for (const child of node.children) {
      applyColorRecursively(child, themeColor);
    }
  }
}