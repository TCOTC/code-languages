import {Plugin} from "siyuan";
import "./index.scss";
export default class PluginSample extends Plugin {
    onload() {
        // 监听代码语言列表准备事件
        this.eventBus.on("code-languages-prepare", (event) => {
            console.log("code-languages-prepare", event);
            const { languages } = event.detail;

            // 定义自定义语言列表（排序在最前面）
            const customLanguages = ['abcdefg'];
            
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
            
            console.log("重新排序后的语言列表:", sortedLanguages);
        });
        
        // 监听代码语言变更事件
        this.eventBus.on("code-languages-change", (event) => {
            console.log("code-languages-change", event);
            const { language, languageChanges } = event.detail;
            
            // 执行相应的操作
            console.log(`代码语言从 ${languageChanges[0].oldLanguage} 更改为: ${language}`);
        });
    }
}
