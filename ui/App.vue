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
        <input v-model="searchKeyword" class="input" placeholder="搜索当前图标名称..." />
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

    <!-- TAB 2: 向指定项目上传同步 -->
    <div v-if="currentTab === 'push'" class="tab-content">
      <button
          class="canvas-extract-btn"
          :disabled="uploading"
          @click="grabFromCanvas"
      >
        ✨ 直接上传画布中选中的图标
      </button>
      <div class="divider">或使用文件上传</div>

      <label class="upload-dropzone" :class="{ 'is-ready': selectedFile }">
        <div class="upload-tip">
          <p v-if="!selectedFile">拖入 <b>iconfont.js / json / svg</b> 到此处</p>
          <p v-else class="file-ready">已选择: {{ selectedFile.name }}</p>
        </div>
        <input type="file" accept=".js,.json,.svg" class="hidden-input" @change="onFileChange" />
      </label>

      <button
          class="submit-btn"
          :class="{ 'btn-ready': selectedFile }"
          :disabled="!selectedFile || uploading"
          @click="uploadToServer"
      >
        {{ uploading ? '正在同步...' : '确认同步上传' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const serverBaseUrl = ref('http://192.168.8.53:3300');
const currentTab = ref('pull');
const projects = ref<any[]>(Array.isArray([]) ? [] : []);
const allIcons = ref<any[]>([]);
const selectedProjectId = ref('all');
const searchKeyword = ref('');

const selectedFile = ref<File | null>(null);
const uploading = ref(false);

// 向 MasterGo 后台发送提取指令
function grabFromCanvas() {
  parent.postMessage({ type: 'extract-canvas-svg' }, '*');
}

// 将画布提取出的节点数据整理并批量调用本地 API
async function uploadExtractedCanvasItems(items: any[]) {
  uploading.value = true;
  try {
    // 构造你的 /api/icons/batch 需要的数据格式
    const payloadItems = items.map(item => {
      // 将字节流解码还原成原本的 SVG 纯文本
      const uint8 = new Uint8Array(item.bytes);
      const svgText = new TextDecoder('utf-8').decode(uint8);

      return {
        name: item.name,
        code: item.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'canvas-icon',
        type: 'svg',
        rawSvg: svgText,
        isColorStripped: true, // 默认帮你去色做成currentColor
        tags: ['画布提取']
      };
    });

    const targetProject = selectedProjectId.value === 'all'
        ? (projects.value[0]?.id || '')
        : selectedProjectId.value;

    const res = await fetch(`${serverBaseUrl.value}/api/icons/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: targetProject,
        items: payloadItems
      })
    });

    if (res.ok) {
      parent.postMessage({ type: 'notify', message: `✅ 成功从画布提取并入库 ${items.length} 个图标！` }, '*');
      fetchData(); // 刷新最新的图标列表
    } else {
      throw new Error('服务器响应异常');
    }
  } catch (err: any) {
    parent.postMessage({ type: 'notify', message: `画布图标同步失败: ${err.message}` }, '*');
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

// 1. 同时获取项目列表与全部图标列表
async function fetchData() {
  try {
    // 获取项目
    const resProj = await fetch(`${serverBaseUrl.value}/api/projects`);
    const dataProj = await resProj.json();
    if (dataProj && Array.isArray(dataProj.projects)) {
      projects.value = dataProj.projects;
    }

    // 获取图标库
    const resIcons = await fetch(`${serverBaseUrl.value}/api/icons`);
    const dataIcons = await resIcons.json();
    if (dataIcons && Array.isArray(dataIcons.icons)) {
      allIcons.value = dataIcons.icons;
      parent.postMessage({ type: 'notify', message: `成功加载 ${dataIcons.icons.length} 个图标` }, '*');
    }
  } catch (err) {
    parent.postMessage({ type: 'notify', message: err }, '*');
  }
}

// 2. 点击图标直接在 MasterGo 中生成
const insertIconToCanvas = (icon: any) => {
  parent.postMessage({
    type: 'insert-single-icon',
    svgContent: icon.svgContent,
    name: icon.name || icon.code
  }, '*');
};

const onFileChange = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    selectedFile.value = files[0];
  }
};

// 3. 上传同步到后端
async function uploadToServer() {
  if (!selectedFile.value) return;
  uploading.value = true;
  try {
    const textContent = await selectedFile.value.text();
    const res = await fetch(`${serverBaseUrl.value}/api/icons/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: selectedProjectId.value === 'all' ? (projects.value[0]?.id || '') : selectedProjectId.value,
        fileName: selectedFile.value.name,
        content: textContent
      })
    });
    if (res.ok) {
      parent.postMessage({ type: 'notify', message: '同步上传成功！' }, '*');
      selectedFile.value = null;
      fetchData(); // 刷新数据
    } else {
      throw new Error('服务器响应异常');
    }
  } catch (err: any) {
    parent.postMessage({ type: 'notify', message: `上传失败: ${err.message}` }, '*');
  } finally {
    uploading.value = false;
  }
}

onMounted(() => {
  fetchData();

  window.addEventListener('message', (event) => {
    const msg = event.data?.pluginMessage;
    if (msg && msg.type === 'selection-svg-result') {
      uploadExtractedCanvasItems(msg.items);
    }
  });
});
</script>

<style scoped>
/* 保持简洁漂亮的UI样式 */
.container { padding: 14px; font-family: sans-serif; background: #fff; height: 100vh; display: flex; flex-direction: column; box-sizing: border-box; }
.config-bar { display: flex; gap: 8px; margin-bottom: 8px; }
.project-selector { margin-bottom: 10px; }
.input-sm { flex: 1; padding: 6px 10px; font-size: 12px; border: 1px solid #d1d5db; border-radius: 6px; }
.btn-sm { padding: 6px 12px; font-size: 12px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
.tabs { display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 10px; }
.tabs button { flex: 1; padding: 8px; background: none; border: none; font-size: 13px; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button.active { color: #2563eb; border-bottom-color: #2563eb; font-weight: 600; }
.tab-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.search-box { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.input { width: 100%; padding: 6px 10px; font-size: 12px; border: 1px solid #d1d5db; border-radius: 6px; }
.count-tip { font-size: 11px; color: #9ca3af; white-space: nowrap; }
.icon-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-height: 300px; padding: 2px; }
.icon-card { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; border: 1px solid #f3f4f6; background: #f9fafb; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.icon-card:hover { border-color: #2563eb; background: #eff6ff; }
.svg-preview { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: #1f2937; }
.icon-name { font-size: 10px; color: #4b5563; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; text-align: center; }
.upload-dropzone { flex: 1; border: 2px dashed #d1d5db; border-radius: 10px; background: #f9fafb; display: flex; align-items: center; justify-content: center; cursor: pointer; min-height: 110px; text-align: center; padding: 12px; }
.upload-dropzone.is-ready { border-color: #2563eb; background: #eff6ff; }
.upload-tip { font-size: 12px; color: #6b7280; }
.file-ready { color: #2563eb; font-weight: 600; }
.hidden-input { display: none; }
.submit-btn { margin-top: 10px; width: 100%; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 500; color: #fff; background: #d1d5db; border: none; cursor: not-allowed; }
.submit-btn.btn-ready { background: #2563eb; cursor: pointer; }
.canvas-extract-btn {
  width: 100%;
  padding: 10px;
  background: #f0fdf4; /* 浅绿色背景 */
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.canvas-extract-btn:hover { background: #dcfce7; border-color: #86efac; }
.canvas-extract-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.divider {
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
  margin: 10px 0;
  position: relative;
}
.divider::before, .divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 35%;
  height: 1px;
  background: #e5e7eb;
}
.divider::before { left: 0; }
.divider::after { right: 0; }
</style>