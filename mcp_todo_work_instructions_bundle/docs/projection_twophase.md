# 投影（Projection）の二相コミット手順

TODO/Spec をファイルへ投影する際の **整合性確保** のため、以下の手順を必須とする。

## 1. 手順（擬似コード）

1. `BEGIN`（論理）
2. DB から対象リソースを読み出し、**現行 vclock** を取得
3. 出力内容を一時ファイル `<path>.tmp` へ書き出す
4. 書き出し後に **検査**（スキーマ/参照/サイズ等）
5. `compare-and-swap`: vclock が一致していれば
   - 新しい vclock を発行し、メタを更新
   - `rename(<path>.tmp, <path>)` をアトミックに実行
6. 成功イベントを配信

vclock が一致しない場合は **中断** し、`CONFLICT` を返す。

## 2. 失敗時のロールバック

- 例外時は `<path>.tmp` を削除し、**何も書き換えない**。
- ログに `who / when / reason / expected_vclock / actual_vclock` を記録。

## 3. 検査フック

- 生成物の lint/validate をフックとして差せるようにする（例：`TODO.md` の ID/親子参照チェック）。