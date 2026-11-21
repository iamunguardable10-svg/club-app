// Render the actual Supabase Go templates, not a reimplementation in JavaScript.
package main

import (
 "bytes"
 "encoding/json"
 "fmt"
 "html"
 "html/template"
 "net/url"
 "regexp"
 "os"
 "path/filepath"
 "strings"
)
type Mail struct { File, Key, Kind, Otp string; RequestLanguage bool }
func check(ok bool, message string) { if !ok { panic(message) } }
func render(path string, data map[string]any) string {
 b, err := os.ReadFile(path); if err != nil { panic(err) }
 t, err := template.New(path).Parse(string(b)); if err != nil { panic(err) }
 var out bytes.Buffer; if err=t.Execute(&out,data); err!=nil { panic(err) }
 return strings.TrimSpace(out.String())
}
// The one auth link: our own confirm page with the one-time code, the link
// type and the return address as one query value (not the auth server's URL).
var hrefPattern = regexp.MustCompile(`<a href="([^"]*)"`)
func checkLink(body string, mail Mail, data map[string]any) {
 m := hrefPattern.FindStringSubmatch(body); check(m != nil, mail.File+" link missing")
 u, err := url.Parse(html.UnescapeString(m[1])); check(err == nil, mail.File+" link does not parse")
 site, _ := data["SiteURL"].(string)
 check(u.String() != "" && strings.HasPrefix(u.String(), site+"/auth/confirm?"), mail.File+" link is not on our own address: "+u.String())
 q := u.Query()
 check(q.Get("token_hash") == "TEST_HASH" && q.Get("type") == mail.Otp && mail.Otp != "", mail.File+" link code or type wrong: "+u.RawQuery)
 redirect, _ := data["RedirectTo"].(string)
 check(q.Get("next") == redirect, mail.File+" return address changed: "+q.Get("next"))
 check(!strings.Contains(body, "TEST_ONLY"), mail.File+" still uses the auth server's link")
}
func main() {
 root := "docs/mail-templates"
 b, err := os.ReadFile(filepath.Join(root,"manifest.json")); if err!=nil { panic(err) }
 var mails []Mail; if err=json.Unmarshal(b,&mails); err!=nil { panic(err) }
 check(len(mails)==13,"expected all 13 account mails")
 catalogs:=map[string]map[string]string{}
 for _,lang:=range []string{"en","de","fr","es"} {
  b,err=os.ReadFile("src/shared/i18n/messages/"+lang+".json");if err!=nil{panic(err)}
  var c map[string]string;if err=json.Unmarshal(b,&c);err!=nil{panic(err)};catalogs[lang]=c
 }
 n:=0
 for _,mail:=range mails {
  source,err:=os.ReadFile(filepath.Join(root,mail.File+".subject.txt"));if err!=nil{panic(err)}
  check(len([]rune(strings.TrimSpace(string(source))))<=255,mail.File+" subject source limit")
  for _,lang:=range []string{"en","de","fr","es","unknown"} {
   for _,mode:=range []string{"account","request","query"} {
    want:=lang;if want=="unknown"{want="en"}
    locale:=lang
    data:=map[string]any{"Data":map[string]any{"locale":locale},"SiteURL":"https://clubos.hebinova.de","RedirectTo":"","Email":"person@example.com","NewEmail":"new@example.com","OldEmail":"old@example.com","Phone":"+490000000002","OldPhone":"+490000000001","Provider":"Example <unsafe>","Token":"123456","TokenHash":"TEST_HASH","ConfirmationURL":"https://example.com/verify?token=TEST_ONLY&type=email"}
    if mode!="account" && mail.RequestLanguage && lang!="unknown" {
     data["Data"]=map[string]any{"locale":"xx"}
     data["RedirectTo"]="https://preview.example.com/join?lang="+lang
     if mode=="query" {data["RedirectTo"]="https://clubos.hebinova.de/join?code=TEAM&go=1&lang="+lang}
    }
    subject:=render(filepath.Join(root,mail.File+".subject.txt"),data)
    body:=render(filepath.Join(root,mail.File+".html"),data)
    check(subject==catalogs[want][mail.Key+".subject"],mail.File+" "+lang+" "+mode+" subject mismatch: "+subject)
    check(strings.Contains(body,`lang="`+want+`"`),mail.File+" body language mismatch")
    check(strings.Contains(body,"CLUB OS")&&strings.Contains(body,"support.clubos@hebinova.com"),"missing brand/support")
    check(!strings.Contains(body,"<img")&&!strings.Contains(body,"{{"),"unexpected remote image or unrendered action")
    links:=strings.Count(body,"<a ")
    if mail.Kind=="link" {check(links==1,"auth link duplicated");checkLink(body,mail,data)
    } else {check(links==0,"unexpected auth link in code/notification")}
    if mail.Kind=="code" {check(strings.Contains(body,"123456"),"missing confirmation code")}
    if strings.Contains(mail.Key,"identity") {check(strings.Contains(body,"Example &lt;unsafe&gt;")&&!strings.Contains(body,"Example <unsafe>"),"provider is not escaped")}
    n++
   }
  }
  if mail.RequestLanguage {
   for _,lang:=range []string{"en","de","fr","es"} {
    for _,redirect:=range []string{"https://clubos.hebinova.de","https://clubos.hebinova.de/start","https://example.com/profilede","https://clubos.hebinova.de/start?lang=xx","https://clubos.hebinova.de/start?lang=es"} {
     want:=lang
     if strings.HasSuffix(redirect,"lang=xx") {want="en"}
     if strings.HasSuffix(redirect,"lang=es") {want="es"}
     data:=map[string]any{"Data":map[string]any{"locale":lang},"SiteURL":"https://clubos.hebinova.de","RedirectTo":redirect,"Email":"person@example.com","NewEmail":"new@example.com","TokenHash":"TEST_HASH","ConfirmationURL":"https://example.com/verify?token=TEST_ONLY&type=email"}
     subject:=render(filepath.Join(root,mail.File+".subject.txt"),data)
     body:=render(filepath.Join(root,mail.File+".html"),data)
     check(subject==catalogs[want][mail.Key+".subject"],mail.File+" legacy/hint subject mismatch: "+subject)
     check(strings.Contains(body,`lang="`+want+`"`),mail.File+" legacy/hint body mismatch")
     if mail.Kind=="link" {checkLink(body,mail,data)}
     n++
    }
   }
  }
  // Missing metadata and a missing redirect must render safely in English.
  data:=map[string]any{"Data":map[string]any{},"Email":"person@example.com","ConfirmationURL":"https://example.com/verify","Token":"123456"}
  check(render(filepath.Join(root,mail.File+".subject.txt"),data)==catalogs["en"][mail.Key+".subject"],"missing metadata fallback")
  render(filepath.Join(root,mail.File+".html"),data)
  fmt.Println("PASS",mail.File)
 }
 fmt.Printf("PASS %d rendered subject/body cases; all 13 metadata fallbacks\n",n)
}
