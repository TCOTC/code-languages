import {Dialog, Setting} from 'siyuan';

// 扩展 Setting 类型以包含 dialog 属性
declare module 'siyuan' {
  interface Setting {
    dialog: Dialog;
  }
}
