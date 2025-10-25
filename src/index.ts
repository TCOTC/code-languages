import {IProtyle, Plugin, Setting, Constants} from "siyuan";
import "./index.scss";

const CONFIG_NAME = "code-languages-config.json";
const STATISTICS_NAME = "code-languages-statistics.json";

// 配置数据结构
interface Config {
    sortMode: 'custom' | 'frequency';  // 排序模式：自定义排序，按频率排序
    customOrder: string;  // 自定义顺序,逗号分隔
    frequencyTopCount: number;  // 频率排序时置顶显示的语言数量(1-15)
    frequencyDaysRange: number;  // 频率统计范围天数(1-90)
    otherCustomLanguages: string;  // 其他自定义语言,逗号分隔
    excludedLanguages: string;  // 剔除的内置语言,逗号分隔
}

// 语言统计数据结构
interface LanguageStats {
    totalCount: number; // 总使用次数
    dates: { // 按日期统计
        [date: string]: number; // 格式: "2025-10-25": 5
    }
}

// 统计数据结构
interface Statistics {
    frequencyOrder: string[]; // 语言频率排序数组
    languages: { // 语言统计数据
        [language: string]: LanguageStats;
    }
}

export default class CodeLanguagesPlugin extends Plugin {
    private config: Config;
    private tempConfig: Config;  // 临时配置，用于存储用户输入
    private statistics: Statistics;
    
    // 缓存解析后的语言列表
    private cachedCustomOrderLanguages: string[] = [];
    private cachedOtherCustomLanguages: string[] = [];
    private cachedExcludedLanguages: string[] = [];

    async onload() {
        // 加载配置和统计数据
        await this.loadData(CONFIG_NAME);
        await this.loadData(STATISTICS_NAME);
        this.config = this.data[CONFIG_NAME] ||= {} as Config;
        this.statistics = this.data[STATISTICS_NAME] || {
            frequencyOrder: [],
            languages: {}
        };
        
        // 默认配置
        this.config.sortMode ||= 'frequency';
        this.config.customOrder ||= '';
        this.config.frequencyTopCount ||= 5;
        this.config.frequencyDaysRange ||= 30;
        this.config.otherCustomLanguages ||= '';
        this.config.excludedLanguages ||= '';
        
        // 初始化临时配置（复制实际配置）
        this.tempConfig = { ...this.config };

        // 解析并缓存配置中的语言列表
        this.parseAndCacheLanguages();

        // 插件设置
        this.setting = new Setting({
            confirmCallback: () => {
                // 将临时配置复制到实际配置
                this.config = { ...this.tempConfig };
                this.saveData(CONFIG_NAME, this.config);
                
                // 配置变更后重新解析并缓存语言列表
                this.parseAndCacheLanguages();
            },
            destroyCallback: () => {
                // 还原临时配置为实际配置
                this.tempConfig = { ...this.config };
            }
        });
        
        this.buildSettingsUI();

        // 代码语言列表更新
        this.eventBus.on("code-language-update", this.languageUpdate);
        // 代码块语言变更
        this.eventBus.on("code-language-change", this.languageChange);

        console.log(this.displayName, this.i18n.onload);
    }

    onunload() {
        this.eventBus.off("code-language-update", this.languageUpdate);
        this.eventBus.off("code-language-change", this.languageChange);

        console.log(this.displayName, this.i18n.onunload);
    }

    async uninstall() {
        this.eventBus.off("code-language-update", this.languageUpdate);
        this.eventBus.off("code-language-change", this.languageChange);

        await this.removeData(CONFIG_NAME);
        await this.removeData(STATISTICS_NAME);

        console.log(this.displayName, this.i18n.uninstall);
    }

    /**
     * 转义 HTML 特殊字符
     */
    private escapeHtml = (html: string) => {
        if (!html) {
            return html;
        }
        return html.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    };

    /**
     * 解析语言输入字符串
     * @param input 输入的语言字符串，用逗号分隔
     * @returns 解析后的语言数组
     */
    private parseLanguagesInput(input: string): string[] {
        if (!input || typeof input !== 'string') {
            return [];
        }

        // 按逗号分割，限制最多 300 个
        const parts = input.split(',').slice(0, 300);
        
        return parts
            .map(part => {
                // 去除首尾空白
                let trimmed = part.trim();
                
                // 将非首尾空白和反引号转为下划线
                trimmed = trimmed.replace(/`| /g, '_');
                
                // 使用 escapeHtml 处理特殊字符
                trimmed = this.escapeHtml(trimmed);
                
                return trimmed;
            })
            .filter(lang => lang.length > 0); // 剔除空字符串
    }

    /**
     * 解析并缓存配置中的语言列表
     */
    private parseAndCacheLanguages(): void {
        this.cachedCustomOrderLanguages = this.parseLanguagesInput(this.config.customOrder);
        this.cachedOtherCustomLanguages = this.parseLanguagesInput(this.config.otherCustomLanguages);
        this.cachedExcludedLanguages = this.parseLanguagesInput(this.config.excludedLanguages);
    }

    /**
     * 获取当前日期字符串 (YYYY-MM-DD)
     */
    private getCurrentDateString(): string {
        const now = new Date();
        return now.toISOString().split('T')[0];
    }

    /**
     * 清理过期的统计数据
     */
    private cleanupExpiredStatistics(): void {
        const currentDate = new Date();
        const cutoffDate = new Date(currentDate.getTime() - this.config.frequencyDaysRange * 24 * 60 * 60 * 1000);
        const cutoffDateString = cutoffDate.toISOString().split('T')[0];

        const languagesToRemove: string[] = [];
        
        for (const language in this.statistics.languages) {
            const languageStats = this.statistics.languages[language];
            let totalCount = 0;
            
            // 清理过期日期数据
            for (const date in languageStats.dates) {
                if (date < cutoffDateString) {
                    delete languageStats.dates[date];
                } else {
                    totalCount += languageStats.dates[date];
                }
            }
            
            // 更新总使用次数
            languageStats.totalCount = totalCount;
            
            // 如果该语言没有任何统计数据，标记为删除
            if (totalCount === 0) {
                languagesToRemove.push(language);
            }
        }
        
        // 删除没有数据的语言
        for (const language of languagesToRemove) {
            delete this.statistics.languages[language];
        }
        
        // 更新频率排序数组
        this.updateFrequencyOrder();
    }

    /**
     * 更新频率排序数组
     */
    private updateFrequencyOrder(): void {
        const sortedLanguages = Object.keys(this.statistics.languages)
            .sort((a, b) => this.statistics.languages[b].totalCount - this.statistics.languages[a].totalCount);
        this.statistics.frequencyOrder = sortedLanguages;
    }

    /**
     * 获取内置语言列表
     */
    private getBuiltinLanguages(): string[] {
        // 获取 highlight.js 支持的语言列表
        const hljsLanguages = (window as any).hljs?.listLanguages() ?? [];
        
        // 获取思源笔记的别名语言列表
        const siyuanAliasLanguages = Constants.ALIAS_CODE_LANGUAGES ?? [];
        
        return [...siyuanAliasLanguages, ...hljsLanguages].sort();
    }

    // 代码语言列表更新
    private languageUpdate = (event: CustomEvent<{ languages: string[], value: string }>) => {
        // console.log("code-language-update", event.detail);
        const { languages, value } = event.detail;
        
        // 使用缓存的语言列表
        const customOrderLanguages = this.cachedCustomOrderLanguages;
        const otherCustomLanguages = this.cachedOtherCustomLanguages;
        const excludedLanguages = this.cachedExcludedLanguages;

        // 过滤时筛选和排序
        if (value) {
            const lowerCaseValue = value.toLowerCase();
            let matchLanguages = this.config.sortMode === 'custom' ? [
                // 自定义排序模式
                ...customOrderLanguages,
                ...otherCustomLanguages.filter(lang => !customOrderLanguages.includes(lang)),
                ...languages.filter(lang => !customOrderLanguages.includes(lang) && !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang)),
            ] : [
                ...otherCustomLanguages,
                ...languages.filter(lang => !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang)),
            ];
            // 使用原生算法筛选 https://github.com/siyuan-note/siyuan/blob/a0593724a20ec42dc2b101b08d5ffa6492148d05/app/src/protyle/toolbar/index.ts#L1302-L1317
            matchLanguages = matchLanguages
                .filter(item => item.toLowerCase().includes(lowerCaseValue))
                .sort((a, b) => {
                    // 不区分大小写
                    const aStartsWith = a.toLowerCase().startsWith(lowerCaseValue);
                    const bStartsWith = b.toLowerCase().startsWith(lowerCaseValue);

                    // 两者都匹配开头时，短字符串优先
                    if (aStartsWith && bStartsWith) return a.length - b.length;
                    if (aStartsWith) return -1;
                    if (bStartsWith) return 1;

                    // 都不匹配时保持原顺序
                    return 0;
                });
            event.detail.languages = matchLanguages;
            return;
        }
        
        
        // 过滤掉被剔除的内置语言
        const availableBuiltinLanguages = languages.filter(lang => !excludedLanguages.includes(lang));
        
        let sortedLanguages: string[] = [];
        
        if (this.config.sortMode === 'custom') {
            // 自定义排序模式
            sortedLanguages = [
                ...customOrderLanguages,
                ...[
                    ...otherCustomLanguages.filter(lang => !customOrderLanguages.includes(lang)),
                    ...languages.filter(lang => !customOrderLanguages.includes(lang) && !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang)),
                ].sort(),
            ];
        } else {
            // 按频率排序模式
            const topFrequencyLanguages = this.statistics.frequencyOrder.slice(0, this.config.frequencyTopCount);
            sortedLanguages = [
                // 直接使用已排序的频率数组，取前 N 个
                ...topFrequencyLanguages,
                ...[
                    // 其他自定义语言
                    ...otherCustomLanguages.filter(lang => !topFrequencyLanguages.includes(lang)),
                    // 剩余的内置语言
                    ...languages.filter(lang => !topFrequencyLanguages.includes(lang) && !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang)),
                ].sort(),
            ];
        }
        
        // 将排序后的语言列表赋值回 event.detail.languages
        event.detail.languages = sortedLanguages;
        
        console.log("重新排序后的语言列表:", sortedLanguages);
    }

    // 代码块语言变更
    private languageChange = (event: CustomEvent<{ language: string, languageElements: HTMLElement[], protyle: IProtyle }>) => {
        // console.log("code-language-change", event);
        const { language } = event.detail;
        
        // 记录语言使用频率
        if (language && language.trim()) {
            const currentDate = this.getCurrentDateString();
            
            // 初始化语言统计数据
            if (!this.statistics.languages[language]) {
                this.statistics.languages[language] = {
                    totalCount: 0,
                    dates: {}
                };
            }
            
            const languageStats = this.statistics.languages[language];
            
            // 增加当天使用次数
            const oldCount = languageStats.dates[currentDate] || 0;
            languageStats.dates[currentDate] = oldCount + 1;
            languageStats.totalCount += 1;
            
            // 更新频率排序数组
            this.updateFrequencyOrder();
            
            // 保存统计数据
            this.saveData(STATISTICS_NAME, this.statistics);
        }
        
        // 清理过期统计数据
        this.cleanupExpiredStatistics();
    }

    public openSetting() {
        this.setting.open(this.displayName || this.name);
        const contentElement = this.setting.dialog.element.querySelector('.b3-dialog__content') as HTMLElement;
        if (contentElement) {
            contentElement.style.scrollbarGutter = 'stable';
        }
        // 初始化配置项可见性
        this.updateSettingsVisibility();
    }

    // 设置界面元素引用
    private customOrderContainer?: HTMLElement;
    private frequencyTopCountContainer?: HTMLElement;
    private frequencyDaysRangeContainer?: HTMLElement;

    /**
     * 构建插件设置界面
     */
    private buildSettingsUI(): void {
        // 排序模式选择
        this.setting.addItem({
            title: this.i18n.sortMode,
            createActionElement: () => {
                const selectElement = document.createElement('select');
                selectElement.className = 'b3-select';
                
                const customOption = document.createElement('option');
                customOption.value = 'custom';
                customOption.textContent = this.i18n.customOrder;
                
                const frequencyOption = document.createElement('option');
                frequencyOption.value = 'frequency';
                frequencyOption.textContent = this.i18n.frequencySort;
                
                selectElement.appendChild(customOption);
                selectElement.appendChild(frequencyOption);
                selectElement.value = this.tempConfig.sortMode;
                
                selectElement.addEventListener('change', (e) => {
                    this.tempConfig.sortMode = (e.target as HTMLSelectElement).value as 'custom' | 'frequency';
                    this.updateSettingsVisibility();
                });
                
                return selectElement;
            }
        });

        // 自定义排序列表
        this.setting.addItem({
            title: this.i18n.customOrderLanguages,
            description: this.i18n.customOrderTip,
            direction: 'row',
            createActionElement: () => {
                const container = document.createElement('div');
                
                const textareaElement = document.createElement('textarea');
                textareaElement.className = 'b3-text-field fn__block';
                textareaElement.spellcheck = false;
                textareaElement.rows = 4;
                textareaElement.placeholder = this.i18n.fillList;
                textareaElement.style.resize = 'vertical';
                textareaElement.value = this.tempConfig.customOrder;
                
                const hrButton = document.createElement('div');
                hrButton.className = 'fn__hr';
                
                const fillButton = document.createElement('button');
                fillButton.className = 'b3-button b3-button--outline fn__size200 fn__flex-center';
                fillButton.style.display = 'flex';
                fillButton.style.marginLeft = 'auto';
                fillButton.textContent = this.i18n.fillAllBuiltinLanguages;
                fillButton.addEventListener('click', () => {
                    const builtinLanguages = this.getBuiltinLanguages();
                    textareaElement.value = builtinLanguages.join(', ');
                    textareaElement.focus();
                });
                
                textareaElement.addEventListener('input', (e) => {
                    this.tempConfig.customOrder = (e.target as HTMLInputElement).value;
                });
                
                container.appendChild(textareaElement);
                container.appendChild(hrButton);
                container.appendChild(fillButton);
                
                this.customOrderContainer = null;
                this.customOrderContainer = container;
                return container;
            }
        });

        // 频率排序置顶数量
        this.setting.addItem({
            title: this.i18n.frequencyTopCount,
            description: this.i18n.frequencyTopCountTip,
            createActionElement: () => {
                const inputElement = document.createElement('input');
                inputElement.className = 'b3-text-field';
                inputElement.type = 'number';
                inputElement.min = '1';
                inputElement.max = '15';
                inputElement.value = this.tempConfig.frequencyTopCount.toString();
                
                inputElement.addEventListener('input', (e) => {
                    const value = parseInt((e.target as HTMLInputElement).value);
                    if (value >= 1 && value <= 15) {
                        this.tempConfig.frequencyTopCount = value;
                    }
                });
                
                this.frequencyTopCountContainer = null;
                this.frequencyTopCountContainer = inputElement;
                return inputElement;
            }
        });

        // 频率统计天数
        this.setting.addItem({
            title: this.i18n.frequencyDaysRange,
            description: this.i18n.frequencyDaysRangeTip,
            createActionElement: () => {
                const inputElement = document.createElement('input');
                inputElement.className = 'b3-text-field';
                inputElement.type = 'number';
                inputElement.min = '1';
                inputElement.max = '90';
                inputElement.value = this.tempConfig.frequencyDaysRange.toString();
                
                inputElement.addEventListener('input', (e) => {
                    const value = parseInt((e.target as HTMLInputElement).value);
                    if (value >= 1 && value <= 90) {
                        this.tempConfig.frequencyDaysRange = value;
                    }
                });
                
                this.frequencyDaysRangeContainer = null;
                this.frequencyDaysRangeContainer = inputElement;
                return inputElement;
            }
        });

        // 其他自定义语言
        this.setting.addItem({
            title: this.i18n.otherCustomLanguages,
            description: this.i18n.otherCustomLanguagesTip,
            createActionElement: () => {
                const textareaElement = document.createElement('textarea');
                textareaElement.className = 'b3-text-field fn__block';
                textareaElement.spellcheck = false;
                textareaElement.rows = 4;
                textareaElement.placeholder = this.i18n.fillList;
                textareaElement.style.resize = 'vertical';
                textareaElement.value = this.tempConfig.otherCustomLanguages;
                
                textareaElement.addEventListener('input', (e) => {
                    this.tempConfig.otherCustomLanguages = (e.target as HTMLInputElement).value;
                });
                
                return textareaElement;
            }
        });

        // 剔除的内置语言
        this.setting.addItem({
            title: this.i18n.excludedLanguages,
            description: this.i18n.excludedLanguagesTip,
            direction: 'row',
            createActionElement: () => {
                const container = document.createElement('div');

                const textareaElement = document.createElement('textarea');
                textareaElement.className = 'b3-text-field fn__block';
                textareaElement.spellcheck = false;
                textareaElement.rows = 4;
                textareaElement.placeholder = this.i18n.fillList;
                textareaElement.style.resize = 'vertical';
                textareaElement.value = this.tempConfig.excludedLanguages;
                
                const hrButton = document.createElement('div');
                hrButton.className = 'fn__hr';
                
                const fillButton = document.createElement('button');
                fillButton.className = 'b3-button b3-button--outline fn__size200 fn__flex-center';
                fillButton.style.display = 'flex';
                fillButton.style.marginLeft = 'auto';
                fillButton.textContent = this.i18n.fillAllBuiltinLanguages;
                fillButton.addEventListener('click', () => {
                    const builtinLanguages = this.getBuiltinLanguages();
                    textareaElement.value = builtinLanguages.join(', ');
                    textareaElement.focus();
                });
                
                textareaElement.addEventListener('input', (e) => {
                    this.tempConfig.excludedLanguages = (e.target as HTMLInputElement).value;
                });
                
                container.appendChild(textareaElement);
                container.appendChild(hrButton);
                container.appendChild(fillButton);
                
                return container;
            }
        });
    }

    /**
     * 更新设置界面配置项可见性
     */
    private updateSettingsVisibility(): void {
        const isCustomMode = this.tempConfig.sortMode === 'custom';
        
        const customOrderContainerLabel = this.customOrderContainer?.closest('.b3-label') as HTMLElement;
        if (customOrderContainerLabel) {
            customOrderContainerLabel.style.display = isCustomMode ? '' : 'none';
        }
        
        const frequencyTopCountContainerLabel = this.frequencyTopCountContainer?.closest('.b3-label') as HTMLElement;
        if (frequencyTopCountContainerLabel) {
            frequencyTopCountContainerLabel.style.display = isCustomMode ? 'none' : '';
        }
        
        const frequencyDaysRangeContainerLabel = this.frequencyDaysRangeContainer?.closest('.b3-label') as HTMLElement;
        if (frequencyDaysRangeContainerLabel) {
            frequencyDaysRangeContainerLabel.style.display = isCustomMode ? 'none' : '';
        }
    }
}

