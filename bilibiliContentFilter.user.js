// ==UserScript==
// @name         哔哩哔哩内容过滤器
// @namespace    https://github.com/zhdbk3
// @version      0.1.0
// @description  设置指定的规则，利用 AI 审核屏蔽掉你不想看的视频！
// @author       着火的冰块nya
// @match        https://*.bilibili.com/*
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @license      Hippocratic 3.0 (HL3-CL)
// @website      https://scriptcat.org/zh-CN/script-show-page/3978
// @source       https://github.com/zhdbk3/BilibiliContentFilter
// @icon         https://www.bilibili.com/favicon.ico
// ==/UserScript==

/* ==UserConfig==
config:
  rules:
    title: 屏蔽规则
    type: textarea
  model:
    title: 模型
    type: text
    default: qwen3:8b
  apiUrl:
    title: API 端点 URL
    type: text
    default: http://127.0.0.1:11434/api/generate
  apiKey:
    title: API 密钥
    type: text
    password: true
  apiFormat:
    title: API 格式
    type: select
    values: [ Ollama, OpenAI 兼容 ]
    default: Ollama
 ==/UserConfig== */

/**
 * 审核一个视频
 * @param videoCard {HTMLDivElement} 该视频的卡片的 `div.bili-video-card` 或 `div.video-page-card-small` 元素
 */
function checkVideo(videoCard) {
    // 跳过已经审核过的视频
    if (videoCard.dataset.checked) {
        return;
    }
    // 打上“已审核”的标记
    videoCard.dataset.checked = 'true';

    // 提取标题
    // `h3.bili-video-card__info--tit` 属于主页和搜索页面（`div.bili-video-card` 后代）
    // `p.title` 属于已打开视频旁边的推荐（`div.video-page-card-small` 后代）
    const titleElement = videoCard.querySelector('h3.bili-video-card__info--tit, p.title');
    // 这里要做判空，因为 B 站主页左上角那个大卡片是用两个普通卡片实现的，不具有 `title`，直接读取会报错
    // 什么奇奇怪怪的实现方法艹
    if (titleElement) {
        const title = titleElement.title;

        // 在过审前先隐藏
        videoCard.hidden = true;

        // 组装请求头，包含 API 密钥（若有）
        const headers = { 'Content-Type': 'application/json' };
        const apiKey = GM_getValue('config.apiKey');
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        // 根据 API 格式组装请求数据
        const data = {
            model: GM_getValue('config.model'),
            stream: false,
        };
        const prompt = `${title}\n请判断以上视频标题是否满足以下规则的任意一项，仅输出True/False，不要输出其他内容\n${GM_getValue('config.rules')}`;
        const apiFormat = GM_getValue('config.apiFormat');
        if (apiFormat === 'Ollama') {
            Object.assign(data, {
                prompt,
                think: false,
                options: { temperature: 0 },
            });
        } else if (apiFormat === 'OpenAI 兼容') {
            Object.assign(data, {
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                extra_body: {
                    enable_thinking: false,
                },
                temperature: 0,
            });
        }

        // 发送请求给 AI 审核
        GM_xmlhttpRequest({
            method: 'POST',
            url: GM_getValue('config.apiUrl'),
            headers: headers,
            responseType: 'json',
            data: JSON.stringify(data),
            onload: (response) => {
                // 处理请求出错
                if (response.status !== 200) {
                    console.error(
                        `视频标题：${title}\n${response.status} ${response.statusText}\n请求出错，暂屏蔽`,
                    );
                    return;
                }

                // 根据 API 格式提取判断结果
                let judgement = '';
                if (apiFormat === 'Ollama') {
                    judgement = response.response.response;
                } else if (apiFormat === 'OpenAI 兼容') {
                    judgement = response.response.choices[0].message.content;
                }
                judgement = judgement.trim();

                // 根据判断结果决定屏蔽或放行
                if (judgement === 'True') {
                    console.log(`已屏蔽：${title}`);
                } else if (judgement === 'False') {
                    // 过审，恢复视频显示
                    videoCard.hidden = false;
                } else {
                    console.error(
                        `视频标题：${title}\nAI 回复：${judgement}\n看不懂思密达，暂屏蔽`,
                    );
                }
            },
        });
    }
}

/**
 * 扫描页面上的视频，并将每个都交由 `checkVideo` 处理
 * `div.bili-video-card` 是主页和搜索页面上的
 * `div.video-page-card-small` 是已打开视频旁边的推荐
 */
function scanVideos() {
    const videoCards = document.querySelectorAll('div.bili-video-card, div.video-page-card-small');
    videoCards.forEach(checkVideo);
}

(function () {
    'use strict';

    // 监听视频区域的变化
    const observer = new MutationObserver(scanVideos);
    // 三个选择器分别为主页、搜索页面、已打开视频旁边的推荐
    let container = document.querySelector('div.container, div.video-list, div.rec-list');
    if (container) {
        // 不知道为什么搜索页面换页时变化不会被监听到
        // 那就提级到整个 `document.body` 吧
        if (container.matches('div.video-list')) {
            container = document.body;
        }
        observer.observe(container, { childList: true, subtree: true });
    }
})();
