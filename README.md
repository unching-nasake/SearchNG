# SearchFilter - Bing & Google Word Filter

検索結果から特定のワードを含むサイトや、特定の動画・ニュースなどを非表示にする拡張機能です。

パソコン版の Chromium 系ブラウザ (Google Chrome, Microsoft Edge など)と、 PC 版・Android 版の Firefox 系ブラウザに対応しています。

## インストール方法

### Google Chrome / Chromium

1. このリポジトリ (またはフォルダ) をローカルに配置します。
2. Chrome のオムニバーに `chrome://extensions` と入力して開きます。
3. 右上の「デベロッパーモード」をオンにします。
4. 「パッケージ化されていない拡張機能を読み込む」をクリックします。
5. `manifest.json` が含まれるフォルダ (`SearchNG`) を選択します。

### Microsoft Edge

1. このリポジトリ (またはフォルダ) をローカルに配置します。
2. Edge のアドレスバーに `edge://extensions` と入力して開きます。
3. 左メニューの「開発者モード」をオンにします。
4. 「展開して読み込み」をクリックします。
5. `manifest.json` が含まれるフォルダ (`SearchNG`) を選択します。

### Firefox

(PC 版)

1. [リリースページ](https://github.com/ikuuyARbdMSt/SearchNG/releases)を開きます。
2. リリースページにある xpi ファイルをクリックして、Firefox に導入できます。

(Android 版)

1. [リリースページ](https://github.com/ikuuyARbdMSt/SearchNG/releases)を開きます。
2. リリースページにある xpi ファイルをダウンロードします。
3. Firefox → 設定 → 一番下の 「Firefox について」 を開きます。
4. Firefox ロゴを 5 回連続タップして、デバッグモードを有効にします。
5. 設定に戻ると 「ファイルから拡張機能をインストール」 が追加されます。
6. それを押して、ダウンロードした xpi ファイルをインストールします。

## 機能

- **Bing / Google 検索フィルター**: 検索結果から指定した NG ワードを含むエントリを非表示にします。
- **NG ワード管理**: NG ワードは、オプション画面のテキストエリアを編集するか、検索画面で選択テキストを右クリックで登録できます。
- **正規表現対応**: 高度なフィルタリングが可能です。
