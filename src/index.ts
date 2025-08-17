import {IProtyle, Plugin, Setting} from "siyuan";
import "./index.scss";

const CONFIG_NAME = "code-languages-config.json";
const STATISTICS_NAME = "code-languages-statistics.json";
export default class CodeLanguagesPlugin extends Plugin {
    async onload() {
        // 加载配置
        await this.loadData(CONFIG_NAME);
        // 初始化配置
        this.data[CONFIG_NAME] ||= {}; // 默认是空字符串，所以用 ||? 而不是 ??=
        // 默认配置
        // this.data[STORAGE_NAME].

        // 插件设置
        this.setting = new Setting({
            confirmCallback: () => {
                // applySetting();
            }
        });
        // 打开插件设置时获取代码语言列表
        // Constants.ALIAS_CODE_LANGUAGES.concat(window.hljs?.listLanguages() ?? []).sort();

        // 监听代码语言列表更新事件
        this.eventBus.on("code-language-update", this.languageUpdate);
        // 监听代码块语言变更事件
        this.eventBus.on("code-language-change", this.languageChange);


        console.log(this.displayName, this.i18n.onload);
    }

    onunload() {
        this.eventBus.off("code-language-update", this.languageUpdate);
        this.eventBus.off("code-language-change", this.languageChange);

        console.log(this.displayName, this.i18n.onunload);
    }

    uninstall() {
        this.eventBus.off("code-language-update", this.languageUpdate);
        this.eventBus.off("code-language-change", this.languageChange);

        console.log(this.displayName, this.i18n.uninstall);
    }

    // 代码语言列表更新
    private languageUpdate = (event: CustomEvent<{ languages: string[], type: string }>) => {
        console.log("code-language-update", event.detail);
        const { languages } = event.detail;
        // console.log("语言列表:", languages);

        // 定义自定义语言列表（排序在最前面）
        const customLanguages = [''];
        
        // 定义优先级语言列表
        const priorityLanguages = ['css', 'js'];
        
        // 重新排序语言列表：优先级语言在前，其他语言在后
        const sortedLanguages = [
            ...customLanguages,
            ...priorityLanguages.filter(lang => languages.includes(lang)),
            ...languages.filter(lang => !priorityLanguages.includes(lang) && !customLanguages.includes(lang))
        ];
        
        // 将排序后的语言列表赋值回 event.detail.languages
        event.detail.languages = sortedLanguages;
        
        // // console.log("重新排序后的语言列表:", sortedLanguages);
    }

    // 代码块语言变更
    private languageChange = (event: CustomEvent<{ language: string, languageElements: HTMLElement[], protyle: IProtyle }>) => {
        console.log("code-language-change", event);
        const { language, languageElements } = event.detail;
        const oldLanguage = languageElements[0].textContent;
        
        // 执行相应的操作
        console.log(`代码语言从 ${oldLanguage} 更改为: ${language}`);
    }
}
