declare module 'firebase-admin/app' {
  export function initializeApp(options: any): any;
  export function getApps(): any[];
  export function cert(options: any): any;
  export type App = any;
}
declare module 'firebase-admin/database' {
  export function getDatabase(app?: any): any;
  export type Database = any;
}
declare module 'firebase-admin/auth' {
  export function getAuth(app?: any): any;
  export type Auth = any;
}
