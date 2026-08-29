import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";

// getFirestore() などを呼ぶ前に一度だけ実行する
initializeApp();

setGlobalOptions({ maxInstances: 10, region: "asia-northeast1" });

export { createFamily } from "./family/createFamily";
export { joinFamily } from "./family/joinFamily";
export { requestItem } from "./item/requestItem";
export { cancelRequest } from "./item/cancelRequest";
export { approveRequest } from "./item/approveRequest";
export { rejectRequest } from "./item/rejectRequest";
export { reportPurchase } from "./item/reportPurchase";
export { cancelAssignment } from "./item/cancelAssignment";
export { detectItems } from "./photo/detectItems";
export { storeCategories } from "./store/storeCategories";
