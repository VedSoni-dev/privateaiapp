import Foundation
import Observation
import StoreKit
import RevenueCat

@MainActor
@Observable
final class PurchaseStore {
    static let productId = "pro_monthly"
    static let entitlementId = "pro"
    static let revenueCatKey = "appl_YotdLyLjfToEZpkucfDKgWajTYT"

    var priceString: String = "$19.99"
    var isPurchasing = false
    var lastError: String?

    private var storeKitProduct: Product?

    func start(deviceId: String, usage: UsageStore) {
        Purchases.logLevel = .warn
        Purchases.configure(withAPIKey: Self.revenueCatKey, appUserID: deviceId)
        Purchases.shared.delegate = PurchaseDelegateHub.shared
        PurchaseDelegateHub.shared.onUpdate = { [weak usage] info in
            Task { @MainActor in
                let active = info.entitlements[Self.entitlementId]?.isActive == true
                usage?.setPro(active)
                await usage?.refreshFromServer()
            }
        }
        Task {
            await refreshPrice()
            await sync(usage: usage)
        }
    }

    func refreshPrice() async {
        do {
            let offerings = try await Purchases.shared.offerings()
            if let pkg = offerings.current?.availablePackages.first {
                priceString = pkg.storeProduct.localizedPriceString
                return
            }
        } catch { /* fall through */ }

        do {
            let products = try await Product.products(for: [Self.productId])
            storeKitProduct = products.first
            if let storeKitProduct {
                priceString = storeKitProduct.displayPrice
            }
        } catch {}
    }

    func sync(usage: UsageStore) async {
        do {
            let info = try await Purchases.shared.customerInfo()
            let active = info.entitlements[Self.entitlementId]?.isActive == true
            usage.setPro(active)
        } catch {}
        await usage.refreshFromServer()
    }

    func purchase(usage: UsageStore) async -> Bool {
        isPurchasing = true
        lastError = nil
        defer { isPurchasing = false }

        do {
            let offerings = try await Purchases.shared.offerings()
            guard let pkg = offerings.current?.availablePackages.first else {
                lastError = "Subscription is not available right now. Please try again later."
                return false
            }
            let result = try await Purchases.shared.purchase(package: pkg)
            if result.userCancelled { return false }
            let active = result.customerInfo.entitlements[Self.entitlementId]?.isActive == true
            usage.setPro(active)
            await usage.refreshFromServer()
            if !active {
                lastError = "Purchase did not activate. Try Restore Purchases."
            }
            return active
        } catch {
            lastError = "Purchase failed. You were not charged — please try again."
            return false
        }
    }

    func restore(usage: UsageStore) async -> Bool {
        do {
            let info = try await Purchases.shared.restorePurchases()
            let active = info.entitlements[Self.entitlementId]?.isActive == true
            usage.setPro(active)
            await usage.refreshFromServer()
            if !active {
                lastError = "No previous purchase found for this Apple ID."
            }
            return active
        } catch {
            lastError = "Restore failed. Please try again."
            return false
        }
    }
}

/// Bridges RevenueCat’s nonisolated delegate into MainActor usage updates.
@Observable
final class PurchaseDelegateHub: NSObject, PurchasesDelegate {
    static let shared = PurchaseDelegateHub()
    var onUpdate: ((CustomerInfo) -> Void)?

    func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        onUpdate?(customerInfo)
    }
}
