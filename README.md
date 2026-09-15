# 运费核算台

面向快递、电商与云仓的纯前端运费计算工具，支持单票试算、XLSX/XLS/CSV 批量核算、报价规则配置、地区附加费、店铺绑定和 CSV 结果导出。

在线使用：<https://bonniechenx.github.io/freight-desk-cn/>

## 隐私

账单解析、运费计算和配置保存均在浏览器本地完成，应用没有后端数据库，也不会主动上传用户导入的业务数据。清理浏览器站点数据会删除本机保存的配置。

## 本地开发

```bash
pnpm install
pnpm dev
```

生成 GitHub Pages 静态文件：

```bash
pnpm build:pages
```
