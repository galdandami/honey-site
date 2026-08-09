// Настройки подключения к Supabase.
//
// 1. Зарегистрируйте проект на https://supabase.com (бесплатный тариф подходит).
// 2. Откройте в проекте SQL Editor и выполните SQL из файла: supabase/schema.sql
// 3. Возьмите URL проекта и anon-ключ: Project Settings → API Keys.
//    Вставьте их ниже в кавычках.
// 4. editorSecret должен совпадать с секретом из schema.sql
//    (по умолчанию там стоит: CHANGE_ME).
//
// Если поля url/anonKey пустые — сайт и админка работают без Supabase
// (правки хранятся локально в браузере).
window.SupabaseConfig = {
  url: "",
  anonKey: "",
  editorSecret: "CHANGE_ME"
};