import XCTest
@testable import NoiraCore

// =============================================================================
// NoiraCore tests
// =============================================================================
// Unit tests for the API client and models. Run with:
//   xcodebuild test -project apps/ios/Noira.xcodeproj -scheme Noira

final class NoiraCoreTests: XCTestCase {

    // MARK: - Model decoding

    func testPersonDecoding() throws {
        let json = """
        {
            "id": "person_1",
            "org_id": "org_1",
            "email": "oshay@o.company",
            "name": "O'Shay Lighten",
            "role": "owner",
            "department": "Operations",
            "status": "active"
        }
        """.data(using: .utf8)!

        let person = try JSONDecoder().decode(Person.self, from: json)
        XCTAssertEqual(person.id, "person_1")
        XCTAssertEqual(person.role, .owner)
        XCTAssertEqual(person.status, .active)
    }

    func testContactFullNameAndInitials() throws {
        let c = Contact(
            id: "c1", orgId: "org1",
            firstName: "Marcus", lastName: "Reyes",
            email: "m@example.com", phone: nil,
            companyId: nil, companyName: nil, title: nil,
            status: "active", lifecycle: "opportunity",
            leadScore: nil, leadTier: nil, lastContactedAt: nil
        )
        XCTAssertEqual(c.fullName, "Marcus Reyes")
        XCTAssertEqual(c.initials, "MR")
    }

    func testDealStageDecoding() throws {
        let json = """
        {
            "id": "d1", "org_id": "org1",
            "name": "Northwind renewal",
            "contact_id": "c1", "company_id": null, "owner_id": null,
            "stage": "negotiation",
            "amount": 24000, "currency": "USD",
            "probability": 0.7, "status": "open",
            "last_activity_at": null,
            "created_at": "2026-06-01T00:00:00Z"
        }
        """.data(using: .utf8)!

        let deal = try JSONDecoder().decode(Deal.self, from: json)
        XCTAssertEqual(deal.stage, .negotiation)
        XCTAssertEqual(deal.amount, 24000)
    }

    func testPhotoJobStatusRoundTrips() throws {
        for status in [PhotoJob.Status.queued, .processing, .ready, .failed, .canceled] {
            let job = PhotoJob(
                id: "p1", orgId: "o1", originalUrl: "https://x",
                filename: "f.jpg", contentType: "image/jpeg", sizeBytes: 100,
                requestedVariations: ["crop-square"], status: status,
                totalCostUsd: 0.12, caption: nil,
                createdAt: "2026-06-20T00:00:00Z", finishedAt: nil
            )
            let encoded = try JSONEncoder().encode(job)
            let decoded = try JSONDecoder().decode(PhotoJob.self, from: encoded)
            XCTAssertEqual(decoded.status, status)
        }
    }

    // MARK: - Config

    func testAppConfigDefaults() {
        XCTAssertEqual(AppConfig.appName, "Noira")
        // API URL should be parseable
        XCTAssertNotNil(AppConfig.apiBaseURL)
    }
}
