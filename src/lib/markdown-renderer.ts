import { marked } from 'marked'
import type { Tokens } from 'marked'

export type TocItem = { id: string; text: string; level: number }

export interface MarkdownRenderResult {
	html: string
	toc: TocItem[]
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
}

// --- SVG 图标定义 ---
const CALLOUT_ICONS: Record<string, string> = {
	note: '<svg viewBox="0 0 16 16"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
	tip: '<svg viewBox="0 0 16 16"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
	warning: '<svg viewBox="0 0 16 16"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
	danger: '<svg viewBox="0 0 16 16"><path d="M2.343 13.657A8 8 0 1 1 13.657 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.75.75 0 0 0-1.06 1.06L6.94 8 4.97 9.97a.75.75 0 1 0 1.06 1.06L8 9.06l1.97 1.97a.75.75 0 1 0 1.06-1.06L9.06 8l1.97-1.97a.75.75 0 1 0-1.06-1.06L8 6.94 6.03 4.97Z"></path></svg>',
	fold: '<svg viewBox="0 0 16 16"><path d="M12.78 5.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 6.28a.75.75 0 0 1 1.06-1.06L8 8.94l3.72-3.72a.75.75 0 0 1 1.06 0Z"></path></svg>'
}

function getIcon(type: string): string {
	const key = type.toLowerCase()
	if (['note', 'info', 'todo'].includes(key)) return CALLOUT_ICONS.note
	if (['tip', 'hint', 'success', 'check', 'done'].includes(key)) return CALLOUT_ICONS.tip
	if (['warning', 'attention', 'caution'].includes(key)) return CALLOUT_ICONS.warning
	if (['danger', 'error', 'bug', 'fail', 'missing'].includes(key)) return CALLOUT_ICONS.danger
	return CALLOUT_ICONS.note
}

// Lazy load shiki
let shikiModule: typeof import('shiki') | null = null
let shikiLoadAttempted = false

async function loadShiki() {
	if (shikiLoadAttempted) {
		return shikiModule
	}
	shikiLoadAttempted = true
	try {
		shikiModule = await import('shiki')
		return shikiModule
	} catch (error) {
		console.warn('Failed to load shiki module:', error)
		return null
	}
}

// Lazy load katex
let katexModule: typeof import('katex') | null = null
let katexLoadAttempted = false

async function loadKatex() {
	if (katexLoadAttempted) return katexModule
	katexLoadAttempted = true
	try {
		katexModule = await import('katex')
		return katexModule
	} catch (error) {
		console.warn('Failed to load katex module:', error)
		return null
	}
}

export async function renderMarkdown(markdown: string): Promise<MarkdownRenderResult> {
	const tokens = marked.lexer(markdown)

	// Extract TOC
	const toc: TocItem[] = []
	function extractHeadings(tokenList: typeof tokens) {
		for (const token of tokenList) {
			if (token.type === 'heading' && token.depth <= 3) {
				const text = token.text
				const id = slugify(text)
				toc.push({ id, text, level: token.depth })
			}
			if ('tokens' in token && token.tokens) {
				extractHeadings(token.tokens as typeof tokens)
			}
		}
	}
	extractHeadings(tokens)

	// Code block processing
	const codeBlockMap = new Map<string, { html: string; original: string }>()
	const shiki = await loadShiki()

	for (const token of tokens) {
		if (token.type === 'code') {
			const codeToken = token as Tokens.Code
			const originalCode = codeToken.text
			const key = `__SHIKI_CODE_${codeBlockMap.size}__`
			if (shiki) {
				try {
					const html = await shiki.codeToHtml(originalCode, {
						lang: codeToken.lang || 'text',
						theme: 'one-light'
					})
					codeBlockMap.set(key, { html, original: originalCode })
					codeToken.text = key
				} catch {
					codeBlockMap.set(key, { html: '', original: originalCode })
					codeToken.text = key
				}
			} else {
				codeBlockMap.set(key, { html: '', original: originalCode })
				codeToken.text = key
			}
		}
	}

	const renderer = new marked.Renderer()

	renderer.heading = (token: Tokens.Heading) => {
		const id = slugify(token.text || '')
		return `<h${token.depth} id="${id}">${token.text}</h${token.depth}>`
	}

	renderer.code = (token: Tokens.Code) => {
		const codeData = codeBlockMap.get(token.text)
		if (codeData) {
			const escapedCode = codeData.original.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			if (codeData.html) {
				return `<pre data-code="${escapedCode}">${codeData.html}</pre>`
			}
			return `<pre data-code="${escapedCode}"><code>${codeData.original}</code></pre>`
		}
		return `<code>${token.text}</code>`
	}

	renderer.listitem = (token: Tokens.ListItem) => {
		let inner = token.text
		let tokens = token.tokens
		if (token.task) tokens = tokens.slice(1)
		inner = marked.parser(tokens) as string
		if (token.task) {
			const checkbox = token.checked ? '<input type="checkbox" checked disabled />' : '<input type="checkbox" disabled />'
			return `<li class="task-list-item">${checkbox} ${inner}</li>\n`
		}
		return `<li>${inner}</li>\n`
	}

	// --- Blockquote 渲染逻辑 (终极修复版) ---
	renderer.blockquote = (token: Tokens.Blockquote) => {
		// 1. 获取引用块内部的第一个 Token
		const firstToken = token.tokens ? token.tokens[0] : null
		
		// 2. 检查这是否是一个段落，并且以 [!TYPE] 开头
		if (firstToken && firstToken.type === 'paragraph') {
			const rawText = firstToken.text
			// 正则：匹配 [!TYPE]+ Title 格式
			const match = rawText.match(/^\[!([a-zA-Z]+)\]([+-]?)(?:[ \t\v]*)(.*)$/m)

			if (match) {
				const type = match[1].toLowerCase()
				const fold = match[2]
				const titleRaw = match[3] || type.toUpperCase()
				
				// 解析标题
				const titleHtmlContent = marked.parseInline(titleRaw)

				// 深度克隆 tokens
				const newTokens = JSON.parse(JSON.stringify(token.tokens))
				const firstNewToken = newTokens[0]

				// --- 关键修复点开始 ---
				// 1. 从 Raw Text 中移除 [!NOTE]... 这一整行
				firstNewToken.text = firstNewToken.text.replace(match[0], '')
				
				// 2. 移除后如果开头有换行符，去掉它
				if (firstNewToken.text.startsWith('\n')) {
					firstNewToken.text = firstNewToken.text.substring(1)
				}

				// 3. 【核心修复】强制 Marked 重新解析这一行文字
				// 因为之前 marked 缓存了包含 [!NOTE] 的 tokens，我们需要重新生成它
				const lexed = marked.lexer(firstNewToken.text)
				if (lexed.length > 0 && (lexed[0] as any).tokens) {
					firstNewToken.tokens = (lexed[0] as any).tokens
				} else {
					firstNewToken.tokens = []
				}

				// 4. 如果移除后内容为空 (说明第一段只有标题)，则移除该 Token
				if (!firstNewToken.text.trim()) {
					newTokens.shift()
				}
				// --- 关键修复点结束 ---

				// 渲染剩余的内容 Body
				const bodyHtml = marked.parser(newTokens)

				// 组装 HTML
				const titleHtml = `
					<div class="callout-title">
						<span class="callout-icon">${getIcon(type)}</span>
						<span>${titleHtmlContent}</span>
						${fold ? `<span class="callout-fold">${CALLOUT_ICONS.fold}</span>` : ''}
					</div>
				`

				if (fold) {
					const openAttr = fold === '+' ? 'open' : ''
					return `
						<details class="callout" data-type="${type}" ${openAttr}>
							<summary>${titleHtml}</summary>
							<div class="callout-content">${bodyHtml}</div>
						</details>
					`
				} else {
					return `
						<div class="callout" data-type="${type}">
							${titleHtml}
							<div class="callout-content">${bodyHtml}</div>
						</div>
					`
				}
			}
		}

		// 如果不匹配，返回普通引用块
		return `<blockquote>${marked.parser(token.tokens)}</blockquote>`
	}

	const katex = await loadKatex()
	const renderMath = (content: string, displayMode: boolean) => {
		if (!katex) return displayMode ? `$$${content}$$` : `$${content}$`
		try {
			return katex.renderToString(content, { displayMode, throwOnError: false, output: 'html', strict: 'ignore' })
		} catch {
			return displayMode ? `$$${content}$$` : `$${content}$`
		}
	}

	marked.use({
		renderer,
		extensions: [
			{
				name: 'mathBlock',
				level: 'block',
				start(src: string) { return src.indexOf('$$') },
				tokenizer(src: string) {
					const match = src.match(/^\$\$([\s\S]+?)\$\$(?:\n+|$)/)
					if (!match) return
					return { type: 'mathBlock', raw: match[0], text: match[1].trim() } as any
				},
				renderer(token: any) { return `${renderMath(token.text || '', true)}\n` }
			},
			{
				name: 'mathInline',
				level: 'inline',
				start(src: string) { return src.indexOf('$') === -1 ? undefined : src.indexOf('$') },
				tokenizer(src: string) {
					if (src.startsWith('$$') || src.startsWith('\\$')) return
					const match = src.match(/^\$([^\n$]+?)\$/)
					if (!match || !match[1].trim()) return
					return { type: 'mathInline', raw: match[0], text: match[1].trim() } as any
				},
				renderer(token: any) { return renderMath(token.text || '', false) }
			}
		]
	})
	const html = (marked.parser(tokens) as string) || ''
	return { html, toc }
}