<template>
  <div class="container">
    <div class="header">
      <h2>导入 Iconfont 图标库</h2>
      <p>请同时上传 JSON 和 JS 文件以生成精美画板</p>
    </div>

    <!-- 核心上传区域 -->
    <label class="upload-area" :class="{ 'is-ready': isReady }">
      <div class="upload-content">
        <!-- 上传图标 -->
        <svg class="upload-icon" :class="{ 'ready-icon': isReady }" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <p class="upload-hint" v-if="!isReady">
          点击选择 <span>.json</span> 和 <span>.js</span>
        </p>
        <p class="upload-success" v-else>已成功读取 {{ fileCount }} 个文件</p>
      </div>
      <input type="file" multiple accept=".json,.js" class="hidden-input" @change="handleFileChange" />
    </label>

    <!-- 文件状态反馈列表 -->
    <div class="status-list">
      <div class="status-item">
        <span class="file-name">iconfont.json</span>
        <span class="file-status" :class="{ 'status-ready': jsonContent }">
          <svg v-if="jsonContent" class="check-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          {{ jsonContent ? '已就绪' : '等待上传...' }}
        </span>
      </div>
      <div class="status-item">
        <span class="file-name">iconfont.js</span>
        <span class="file-status" :class="{ 'status-ready': jsContent }">
          <svg v-if="jsContent" class="check-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          {{ jsContent ? '已就绪' : '等待上传...' }}
        </span>
      </div>
    </div>

    <!-- 底部操作按钮 -->
    <button class="submit-btn" :class="{ 'btn-ready': isReady }" :disabled="!isReady" @click="startImport">
      <svg v-if="isReady" class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
      开始生成画板
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const jsonContent = ref('');
const jsContent = ref('');
const fileCount = ref(0);

const isReady = computed(() => jsonContent.value !== '' && jsContent.value !== '');

const handleFileChange = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;

  fileCount.value = files.length;
  jsonContent.value = '';
  jsContent.value = '';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name.endsWith('.json')) {
      jsonContent.value = await file.text();
    } else if (file.name.endsWith('.js')) {
      jsContent.value = await file.text();
    }
  }
};

const startImport = () => {
  if (!isReady.value) return;

  parent.postMessage({
    type: 'import-iconfont',
    json: jsonContent.value,
    svg: jsContent.value
  }, '*');
};
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.container {
  padding: 20px;
  background-color: #ffffff;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #333;
  display: flex;
  flex-direction: column;
}

.header {
  margin-bottom: 20px;
}

.header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px 0;
}

.header p {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}

/* 上传区域 */
.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 120px;
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  background-color: #f9fafb;
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-area:hover {
  background-color: #f3f4f6;
  border-color: #9ca3af;
}

.upload-area.is-ready {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.upload-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
  color: #9ca3af;
}

.ready-icon {
  color: #3b82f6;
}

.upload-hint {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.upload-hint span {
  font-weight: 600;
  color: #2563eb;
}

.upload-success {
  font-size: 14px;
  font-weight: 500;
  color: #2563eb;
  margin: 0;
}

.hidden-input {
  display: none;
}

/* 状态列表 */
.status-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: #f9fafb;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  font-size: 12px;
}

.file-name {
  font-weight: 500;
  color: #4b5563;
}

.file-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #9ca3af;
}

.status-ready {
  color: #16a34a;
}

.check-icon {
  width: 14px;
  height: 14px;
}

/* 按钮 */
.submit-btn {
  margin-top: 24px;
  width: 100%;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  border: none;
  background-color: #d1d5db;
  cursor: not-allowed;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.submit-btn.btn-ready {
  background-color: #2563eb;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}

.submit-btn.btn-ready:hover {
  background-color: #1d4ed8;
}

.submit-btn.btn-ready:active {
  transform: scale(0.98);
}

.btn-icon {
  width: 16px;
  height: 16px;
}
</style>