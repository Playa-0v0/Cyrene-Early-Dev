# Cyrene-Agent 早期阶段纪念仓库

本仓库是 [Cyrene-Agent](https://github.com/Playa-Cyrene/Cyrene-Agent) **项目初创阶段**的历史快照，
用于存档那段「一切都只发生在自己电脑上」的时期。

## 快照范围

| 项目 | 内容 |
| --- | --- |
| 提交区间 | `a84754ae` → `0323aaf2`（连续的首 340 个提交） |
| 时间跨度 | 2026-06-11 ~ 2026-07-08 |
| 版本号 | `0.1.0`（尚未发布任何 tag / Release） |
| 首个提交 | `a84754ae` — *stage 1: live2d model rendering verified on canvas* |
| 末个提交 | `0323aaf2` — *refactor(models): unify local model lifecycle and fix bge-m3 detection* |

截取的截止点，正是这个项目第一次以真实身份对外提交的前夜
（`0323aaf2` 的下一个提交 `8675c7a6`，2026-07-08，才是第一笔以本人身份 `Playa-0v0` 提交的记录）。

## 为什么会有这个仓库

初创阶段的所有提交都在本机完成，作者身份是当时的占位符：

```
Cyrene Dev <cyrene@local>     335 个提交
Cyrene <dev@local>              2 个提交
codex <codex@local>             1 个提交
Playa-0v0 <ky2569ly@gmail.com>  1 个提交
```

`cyrene@local` 之类的邮箱从未绑定过任何 GitHub 账号，因此这些提交在任何远端的贡献记录里都不曾出现过。

2026-10-20，这份历史被完整重写：占位身份统一改为 GitHub 账号
`300061045+Playa-0v0@users.noreply.github.com`，**作者日期与提交日期一律保留原值**，
文件内容与重写前逐字节一致（树哈希均为 `1b86689203cee722321343edfdb31c31553c7be1`）。

也就是说：这段在本地写下的时间线，现在能被 GitHub 正确归属到它的作者名下。

## 与主仓库的关系

- 主仓库仍在继续演进，本仓库**不接收任何后续提交**，是只读的历史切片。
- 本仓库的提交哈希与主仓库不同（作者身份改变必然导致哈希变化），两者**不可直接合并**；
  需要对照时，请按**作者 + 日期 + 提交信息**匹配，而不是按哈希。
- 首个版本 `v1.1.2` 及其后的所有发布记录，都以主仓库为准。

## 许可

沿用主仓库的 MIT 许可证，版权归 Playa 所有。
