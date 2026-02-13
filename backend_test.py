import requests
import sys
from datetime import datetime

class ProductConfiguratorTester:
    def __init__(self, base_url="https://wall-panel-config.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def run_test(self, name, method, endpoint, expected_status, data=None, expected_content=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else self.api_url
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json() if response.text else {}
            except:
                response_data = {"raw_response": response.text}

            if success:
                # Additional content validation if specified
                if expected_content:
                    for key, expected_value in expected_content.items():
                        if key not in response_data or response_data[key] != expected_value:
                            success = False
                            print(f"❌ Failed - Content validation failed for {key}")
                            break

            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                self.test_results.append({"test": name, "status": "PASS", "response_size": len(str(response_data))})
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text[:200]}...")
                self.test_results.append({"test": name, "status": "FAIL", "error": f"Status {response.status_code}"})

            return success, response_data

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({"test": name, "status": "ERROR", "error": str(e)})
            return False, {}

    def test_api_root(self):
        """Test API root endpoint"""
        return self.run_test("API Root", "GET", "", 200)

    def test_get_all_products(self):
        """Test getting all products"""
        success, response = self.run_test("Get All Products", "GET", "products", 200)
        
        if success and response:
            print(f"   📊 Found {len(response)} product types")
            
            # Validate product structure
            required_fields = ["id", "name", "active", "categories"]
            for i, product in enumerate(response):
                for field in required_fields:
                    if field not in product:
                        print(f"   ⚠️  Product {i} missing field: {field}")
                        return False
                        
            # Check for expected product types
            product_names = [p["name"] for p in response]
            expected_products = [
                "Flat / Embossed VMD Panels",
                "Colored HD VMD Panels", 
                "Colored HD Ombre Panels",
                "VicStrip Panels"
            ]
            
            for expected in expected_products:
                if expected not in product_names:
                    print(f"   ⚠️  Missing expected product: {expected}")
                    return False
                    
            print(f"   ✅ All expected product types found")
            
            # Check active/inactive status
            active_products = [p for p in response if p["active"]]
            inactive_products = [p for p in response if not p["active"]]
            print(f"   📈 Active products: {len(active_products)}")
            print(f"   📉 Inactive products: {len(inactive_products)}")
            
            # Validate VMD panels have emboss categories
            vmd_product = next((p for p in response if "VMD Panels" in p["name"] and p["active"]), None)
            if vmd_product:
                emboss_categories = [c for c in vmd_product.get("categories", []) if c.get("emboss_available")]
                expected_emboss = ["Marble", "Wood Classics", "Soft Texture", "Leather"]
                emboss_names = [c["name"] for c in emboss_categories]
                
                for expected in expected_emboss:
                    if expected not in emboss_names:
                        print(f"   ⚠️  Missing emboss category: {expected}")
                        return False
                        
                print(f"   ✅ Emboss categories validated: {len(emboss_categories)} found")
            
            # Validate VicStrip has colors and patterns
            vicstrip_product = next((p for p in response if p["name"] == "VicStrip Panels"), None)
            if vicstrip_product:
                colors = vicstrip_product.get("colors", [])
                patterns = vicstrip_product.get("patterns", [])
                print(f"   🎨 VicStrip colors: {len(colors)}")
                print(f"   🔲 VicStrip patterns: {len(patterns)}")
                
                if len(colors) == 0 or len(patterns) == 0:
                    print(f"   ⚠️  VicStrip missing colors or patterns")
                    return False
                    
        return success

    def test_get_specific_product(self):
        """Test getting a specific product by ID"""
        return self.run_test("Get VMD Product", "GET", "products/flat-embossed-vmd", 200)

    def test_get_product_categories(self):
        """Test getting categories for a product"""
        success, response = self.run_test("Get VMD Categories", "GET", "products/flat-embossed-vmd/categories", 200)
        
        if success and response:
            print(f"   📂 Found {len(response)} categories")
            
            # Check for emboss-available categories
            emboss_categories = [c for c in response if c.get("emboss_available")]
            print(f"   ✨ Emboss-available categories: {len(emboss_categories)}")
            
        return success

    def test_get_category_designs(self):
        """Test getting designs for a category"""
        return self.run_test("Get Category Designs", "GET", "products/flat-embossed-vmd/categories/vmd-marble/designs", 200)

    def test_nonexistent_product(self):
        """Test getting a non-existent product"""
        success, response = self.run_test("Get Non-existent Product", "GET", "products/nonexistent", 200)
        
        if success and response:
            if "error" not in response:
                print(f"   ⚠️  Expected error response for non-existent product")
                return False
            print(f"   ✅ Proper error handling for non-existent product")
            
        return success

def main():
    print("🚀 Starting UniVicoustic Product Configurator API Tests")
    print("=" * 60)
    
    tester = ProductConfiguratorTester()
    
    # Run all tests
    tests = [
        tester.test_api_root,
        tester.test_get_all_products,
        tester.test_get_specific_product,
        tester.test_get_product_categories,
        tester.test_get_category_designs,
        tester.test_nonexistent_product,
    ]
    
    for test in tests:
        test()
    
    # Print summary
    print("\n" + "=" * 60)
    print(f"📊 Test Summary:")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())