<template>
  <div class="container">
    <!-- 顶部连接与项目选择栏 -->
    <div class="config-bar">
      <input
          v-model="serverBaseUrl"
          class="input-sm"
          placeholder="后端服务地址"
      />
      <button class="btn-sm" @click="fetchData">刷新数据</button>
    </div>

    <!-- 项目切换下拉框 -->
    <div class="project-selector">
      <select v-model="selectedProjectId" class="input">
        <option value="all">全量合集 (所有项目)</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">
          {{ p.name }} ({{ p.totalCount }}个图标)
        </option>
      </select>
    </div>

    <!-- Tab 切换导航 -->
    <div class="tabs">
      <button :class="{ active: currentTab === 'pull' }" @click="currentTab = 'pull'">从本地拉取图标</button>
      <button :class="{ active: currentTab === 'push' }" @click="currentTab = 'push'">向本地上传同步</button>
    </div>

    <!-- TAB 1: 从指定项目拉取图标并插入画布 -->
    <div v-if="currentTab === 'pull'" class="tab-content">
      <div class="search-box">
        <input v-model="searchKeyword" class="input" placeholder="搜索当前图标名称..."/>
        <span class="count-tip">共 {{ filteredIcons.length }} 个</span>
      </div>

      <div class="icon-grid">
        <div
            v-for="icon in filteredIcons"
            :key="icon.id"
            class="icon-card"
            @click="insertIconToCanvas(icon)"
            title="点击插入 MasterGo 画布"
        >
          <div class="svg-preview" v-html="icon.svgContent"></div>
          <span class="icon-name">{{ icon.name || icon.code }}</span>
        </div>
      </div>
    </div>

    <!-- TAB 2: 向指定项目上传同步 (支持提取、重命名、批量入库) -->
    <div v-if="currentTab === 'push'" class="tab-content">
      <!-- 状态 A：尚未提取，显示一键提取按钮 -->
      <div v-if="extractedList.length === 0" class="push-init-view">
        <div class="empty-state">
          <p>1. 在 MasterGo 画布中选中图标（支持多选）</p>
          <p>2. 点击下方按钮提取并确认图标名称</p>
        </div>
        <button
            class="canvas-extract-btn"
            @click="grabFromCanvas"
        >
          ✨ 提取选中的图标
        </button>
      </div>

      <!-- 状态 B：已提取，显示可编辑名称的列表与确认上传按钮 -->
      <div v-else class="push-edit-view">
        <div class="list-header">
          <span class="list-title">待上传图标 ({{ extractedList.length }})</span>
          <button class="text-btn" @click="extractedList = []">重新选择</button>
        </div>

        <div class="edit-list">
          <div v-for="(item, index) in extractedList" :key="index" class="edit-item">
            <span class="item-index">{{ index + 1 }}</span>
            <input
                v-model="item.name"
                type="text"
                class="input name-input"
                placeholder="请输入图标名称"
            />
          </div>
        </div>

        <button
            class="canvas-extract-btn"
            :class="{ 'is-loading': uploading }"
            :disabled="uploading"
            @click="confirmAndUpload"
        >
          {{ uploading ? '正在同步入库...' : '🚀 确认并同步到当前分组' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';

const serverBaseUrl = ref('https://docile-photo-natural.ngrok-free.dev');
async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const headers = {
    'ngrok-skip-browser-warning': 'true',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const cleanBase = serverBaseUrl.value.replace(/\/$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${cleanBase}${cleanEndpoint}`;
  return await fetch(url, { ...options, headers });
}

const currentTab = ref('pull');
const projects = ref<any[]>([]);
const allIcons = ref<any[]>([]);
const selectedProjectId = ref('all');
const searchKeyword = ref('');
const uploading = ref(false);

// 新增：存储从画布提取出来、待用户确认和修改名称的图标列表
const extractedList = ref<Array<{
  name: string;
  originalName: string;
  svgText?: string;
  bytes?: any;
  width: number;
  height: number;
}>>([]);

// 向 MasterGo 后台发送提取指令
function grabFromCanvas() {
  parent.postMessage({type: 'extract-canvas-svg'}, '*');
}

// 核心：用户核对并修改完名称后，点击确认上传
async function confirmAndUpload() {
  if (extractedList.value.length === 0) return;
  uploading.value = true;

  try {
    const payloadItems = await Promise.all(extractedList.value.map(async (item, index) => {
      let rawSvgText = item.svgText || '';

      // 兼容二进制转字符串兜底
      if (!rawSvgText && item.bytes) {
        let arr = item.bytes;
        if (!Array.isArray(arr) && typeof arr === 'object') {
          arr = Object.values(arr).filter(n => typeof n === 'number');
        }
        rawSvgText = new TextDecoder('utf-8').decode(new Uint8Array(arr));
      }

      rawSvgText = rawSvgText.replace(/\0/g, '').replace(/<\?xml.*?\?>/i, '').trim();

      if (!rawSvgText.includes('<svg')) {
        throw new Error(`图标 [${item.name}] 内容不是有效的 SVG`);
      }

      // 1. 调用预览接口清洗格式与去色
      const previewRes = await apiFetch(`/api/icons/preview-svg`, {
        method: 'POST',
        body: JSON.stringify({
          rawSvg: rawSvgText,
          stripColor: true
        })
      });

      if (!previewRes.ok) {
        const errText = await previewRes.text();
        throw new Error(`预览解析失败 (${previewRes.status}): ${errText}`);
      }

      const previewData = await previewRes.json();
      // 使用你在输入框中修改后的名字
      const safeName = (item.name || `icon-${index}`).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

      // 组装 batch 接口所需的标准格式
      return {
        tempId: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        name: safeName,
        code: safeName,
        format: "svg",
        height: previewData.height || Math.round(item.height) || 1024,
        width: previewData.width || Math.round(item.width) || 1024,
        isColorStripped: true,
        previewSvg: previewData.svgContent,
        rawSvg: rawSvgText,
        tags: [],
        type: "svg"
      };
    }));

    const targetProject = selectedProjectId.value === 'all'
        ? (projects.value[0]?.id || '')
        : selectedProjectId.value;

    // 2. 调用 batch 接口正式入库
    const batchRes = await apiFetch(`/api/icons/batch`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: targetProject,
        items: payloadItems
      })
    });

    if (batchRes.ok) {
      parent.postMessage({ type: 'notify', message: `✅ 成功提取并入库 ${payloadItems.length} 个图标！` }, '*');
      extractedList.value = []; // 清空待上传列表
      fetchData(); // 刷新列表
    } else {
      const errText = await batchRes.text();
      throw new Error(`入库失败 (${batchRes.status}): ${errText}`);
    }
  } catch (err: any) {
    parent.postMessage({ type: 'notify', message: `❌ ${err.message}` }, '*');
    console.error('[前端UI] 上传失败:', err);
  } finally {
    uploading.value = false;
  }
}

// 根据所选项目过滤图标
const filteredIcons = computed(() => {
  let list = allIcons.value;
  if (selectedProjectId.value !== 'all') {
    list = list.filter(item => item.projectId === selectedProjectId.value);
  }
  if (!searchKeyword.value) return list;
  return list.filter(item =>
      item.name?.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchKeyword.value.toLowerCase())
  );
});

// 获取项目列表与全部图标列表
async function fetchData() {
  try {
    const [resProj, resIcons] = await Promise.all([
      apiFetch('/api/projects'),
      apiFetch('/api/icons')
    ]);
    const dataProj = await resProj.json();
    if (dataProj && Array.isArray(dataProj.projects)) {
      projects.value = dataProj.projects;
    }

    const dataIcons = await resIcons.json();
    if (dataIcons && Array.isArray(dataIcons.icons)) {
      allIcons.value = dataIcons.icons;
      parent.postMessage({type: 'notify', message: `成功加载 ${dataIcons.icons.length} 个图标`}, '*');
    }
  } catch (err: any) {
    parent.postMessage({type: 'notify', message: err?.message || String(err)}, '*');
  }
}

// 点击图标直接在 MasterGo 中生成
const insertIconToCanvas = (icon: any) => {
  parent.postMessage({
    type: 'insert-single-icon',
    svgContent: icon.svgContent,
    name: icon.name || icon.code
  }, '*');
};

onMounted(() => {
  fetchData();

  window.addEventListener('message', (event) => {
    const msg = event.data?.pluginMessage || event.data;
    if (!msg) return;

    if (msg.type === 'selection-svg-result') {
      console.log('[前端UI] 收到后台发来的 SVG 数据:', msg.items);
      // 提取后先放入待确认列表，允许用户重命名
      extractedList.value = msg.items.map((item: any) => ({
        name: item.name || 'icon',
        originalName: item.name || 'icon',
        svgText: item.svgText,
        bytes: item.bytes,
        width: item.width || 24,
        height: item.height || 24
      }));
    }
  });
});
</script>

<style scoped>
.container {
  padding: 14px;
  font-family: sans-serif;
  background: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.config-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.project-selector {
  margin-bottom: 10px;
}

.input-sm {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 10px;
}

.tabs button {
  flex: 1;
  padding: 8px;
  background: none;
  border: none;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tabs button.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 600;
}

.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.count-tip {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
}

.icon-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  max-height: 300px;
  padding: 2px;
}

.icon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 1px solid #f3f4f6;
  background: #f9fafb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-card:hover {
  border-color: #2563eb;
  background: #eff6ff;
}

.svg-preview {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1f2937;
}

.icon-name {
  font-size: 10px;
  color: #4b5563;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  text-align: center;
}

.empty-state {
  padding: 20px 10px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.8;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 16px;
}

.canvas-extract-btn {
  width: 100%;
  padding: 12px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.canvas-extract-btn:hover {
  background: #1d4ed8;
}

.canvas-extract-btn.is-loading {
  background: #93c5fd;
  cursor: not-allowed;
}

/* 待上传重命名列表样式 */
.push-edit-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.list-title {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.text-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: #ef4444;
  cursor: pointer;
}
.text-btn:hover {
  text-decoration: underline;
}

.edit-list {
  flex: 1;
  overflow-y: auto;
  max-height: 260px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px;
  background: #f9fafb;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #f3f4f6;
}

.item-index {
  font-size: 11px;
  color: #9ca3af;
  width: 16px;
  text-align: right;
}

.name-input {
  flex: 1;
}
</style>