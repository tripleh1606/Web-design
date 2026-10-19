"use client";

import { useState, useEffect } from "react";
import { DRINKS, formatVND } from "@/lib/menu";
import { normalizeVietnameseText } from "@/lib/string";
import { isShopOpen, DEFAULT_HOURS, formatDayName } from "@/lib/operating-hours";

// Define Types
type PromoType = "percentage" | "fixed_amount" | "buy_x_get_y" | "free_upsize";

interface Promotion {
  id: string;
  name: string;
  type: PromoType;
  scope: "all" | "products" | "categories";
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  minQuantity: number;
  minOrderValue: number;
  canCombine: boolean;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  // Dynamic fields
  discountPercentage?: number;
  discountAmount?: number;
  buyQuantity?: number;
  getQuantity?: number;
  getFreeProductId?: string;
}

const TYPE_LABELS: Record<PromoType, string> = {
  percentage: "Giảm theo phần trăm",
  fixed_amount: "Giảm theo số tiền",
  buy_x_get_y: "Mua X tặng Y",
  free_upsize: "Free Upsize",
};

export default function AdminDashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [loading, setLoading] = useState(false);

  // Data state
  const [activeTab, setActiveTab] = useState<"promotions" | "orders" | "hours" | "categories" | "products" | "options">("promotions");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [operatingHours, setOperatingHours] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productForm, setProductForm] = useState<any>({
    name: "", family: "", base_price: 0, image: "", is_available: true,
  });
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [categoryForm, setCategoryForm] = useState<any>({ name: "", is_available: true });
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<any | null>(null);
  const [optionForm, setOptionForm] = useState<any>({ 
    label: "", option_group: "topping", price: 0, extra_price: 0, is_available: true, is_default: false, category_ids: [] 
  });

  // Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

  const [formData, setFormData] = useState<Partial<Promotion>>({
    name: "",
    type: "percentage",
    scope: "all",
    applicableProductIds: [],
    applicableCategoryIds: [],
    minQuantity: 0,
    minOrderValue: 0,
    canCombine: false,
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    isActive: true,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        fetchPromotions();
        fetchOrders();
        fetchOperatingHours();
        fetchCategories();
        fetchProducts();
        fetchOptions();
      } else {
        setPinError("Mã PIN không đúng");
      }
    } catch (err) {
      setPinError("Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`/api/admin/products?_t=${Date.now()}`);
      if (res.ok) setProducts(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`/api/admin/categories?_t=${Date.now()}`);
      if (res.ok) setCategories(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOptions = async () => {
    try {
      const res = await fetch(`/api/admin/options?_t=${Date.now()}`);
      if (res.ok) setOptions(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOperatingHours = async () => {
    try {
      const res = await fetch(`/api/operating-hours?_t=${Date.now()}`);
      if (res.ok) {
        setOperatingHours(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPromotions = async () => {
    setIsFetching(true);
    try {
      const res = await fetch("/api/admin/promotions");
      if (res.ok) {
        const data = await res.json();
        const mappedData: Promotion[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          scope: item.scope || "all",
          applicableProductIds: item.promotion_products ? item.promotion_products.map((p: any) => p.product_id) : (item.applicable_product_id ? [item.applicable_product_id] : []),
          applicableCategoryIds: item.promotion_categories ? item.promotion_categories.map((c: any) => c.category_id) : [],
          minQuantity: item.min_quantity || 0,
          minOrderValue: item.min_order_value || 0,
          canCombine: item.allow_stacking || false,
          startDate: item.start_date,
          endDate: item.end_date,
          isActive: item.is_active,
          discountPercentage: item.type === "percentage" ? item.discount_value : undefined,
          discountAmount: item.type === "fixed_amount" ? item.discount_value : undefined,
          buyQuantity: item.buy_quantity,
          getQuantity: item.get_quantity,
          getFreeProductId: item.reward_product_id,
        }));
        setPromotions(mappedData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleToggleActive = async (promo: Promotion) => {
    try {
      const res = await fetch(`/api/admin/promotions/${promo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !promo.isActive }),
      });
      if (res.ok) fetchPromotions();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa khuyến mãi này?")) return;
    try {
      const res = await fetch(`/api/admin/promotions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchPromotions();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/admin/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!confirm("Bạn có chắc muốn xoá đơn này?")) return;
    try {
      // Optimistic update
      setOrders(prev => prev.filter(o => o.id !== id));
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("Có lỗi xảy ra khi xoá đơn");
        fetchOrders();
      }
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra khi xoá đơn");
      fetchOrders();
    }
  };

  const openForm = (promo?: Promotion) => {
    if (promo) {
      setEditingPromo(promo);
      setFormData({
        ...promo,
        startDate: promo.startDate ? new Date(promo.startDate).toISOString().split("T")[0] : "",
        endDate: promo.endDate ? new Date(promo.endDate).toISOString().split("T")[0] : "",
      });
    } else {
      setEditingPromo(null);
      setFormData({
        name: "",
        type: "percentage",
        scope: "all",
        applicableProductIds: [],
        applicableCategoryIds: [],
        minQuantity: 0,
        minOrderValue: 0,
        canCombine: false,
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        isActive: true,
        discountPercentage: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return alert("Vui lòng nhập tên chương trình");
    
    // Map camelCase frontend state to snake_case backend API expected payload
    const payload = {
      name: formData.name,
      type: formData.type,
      is_active: formData.isActive,
      allow_stacking: formData.canCombine,
      min_quantity: formData.minQuantity,
      min_order_value: formData.minOrderValue,
      discount_value: formData.type === "percentage" ? formData.discountPercentage : formData.discountAmount,
      buy_quantity: formData.buyQuantity,
      get_quantity: formData.getQuantity,
      scope: formData.scope,
      applicable_product_ids: formData.scope === "products" ? formData.applicableProductIds : [],
      applicable_category_ids: formData.scope === "categories" ? formData.applicableCategoryIds : [],
      reward_product_id: formData.getFreeProductId,
      start_date: formData.startDate,
      end_date: formData.endDate || null,
    };

    try {
      const url = editingPromo 
        ? `/api/admin/promotions/${editingPromo.id}` 
        : "/api/admin/promotions";
      const method = editingPromo ? "PATCH" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchPromotions();
      } else {
        alert("Có lỗi xảy ra khi lưu");
      }
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra khi lưu");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfcfc]">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-sm w-full text-center">
          <h1 className="text-2xl font-bold text-[#155727] mb-2">Soucha Admin</h1>
          <p className="text-[#43281a] mb-6">Nhập mã PIN để tiếp tục</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center text-3xl tracking-[0.5em] p-4 rounded-xl border border-gray-200 focus:border-[#155727] focus:ring-1 focus:ring-[#155727] outline-none mb-4 text-[#43281a]"
              placeholder="••••••"
              autoFocus
            />
            {pinError && <p className="text-red-500 text-sm mb-4">{pinError}</p>}
            <button
              type="submit"
              disabled={loading || pin.length !== 6}
              className="w-full bg-[#155727] text-white py-3 rounded-xl font-medium disabled:opacity-50 transition-opacity"
            >
              {loading ? "Đang xác thực..." : "Đăng nhập"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfcfc] text-[#43281a] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col gap-6 mb-8 border-b pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#155727]">Soucha Admin</h1>
              <p className="text-sm opacity-80">Quản lý hệ thống</p>
            </div>
            {activeTab === "promotions" && (
              <button
                onClick={() => openForm()}
                className="bg-[#155727] text-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                + Thêm khuyến mãi
              </button>
            )}
            {activeTab === "products" && (
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProductForm({ name: "", family: categories[0]?.id || "", base_price: 0, image: "", is_available: true });
                  setIsProductModalOpen(true);
                }}
                className="bg-[#155727] text-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                + Thêm món
              </button>
            )}
            {activeTab === "categories" && (
              <button
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryForm({ name: "", is_available: true });
                  setIsCategoryModalOpen(true);
                }}
                className="bg-[#155727] text-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                + Thêm danh mục
              </button>
            )}
            {activeTab === "options" && (
              <button
                onClick={() => {
                  setEditingOption(null);
                  setOptionForm({ label: "", option_group: "topping", price: 0, extra_price: 0, is_available: true, is_default: false, category_ids: [] });
                  setIsOptionModalOpen(true);
                }}
                className="bg-[#155727] text-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                + Thêm tùy chọn
              </button>
            )}
          </div>
          <div className="flex overflow-x-auto hide-scrollbar gap-2 md:gap-4 items-center">
            <button
              onClick={() => setActiveTab("promotions")}
              className={`pb-2 px-1 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors ${activeTab === "promotions" ? "border-[#155727] text-[#155727]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Khuyến mãi
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`pb-2 px-1 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors ${activeTab === "orders" ? "border-[#155727] text-[#155727]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Đơn hàng
            </button>
            <button
              onClick={() => setActiveTab("hours")}
              className={`pb-2 px-1 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors ${activeTab === "hours" ? "border-[#155727] text-[#155727]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Giờ hoạt động
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`pb-2 px-1 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors ${activeTab === "categories" ? "border-[#155727] text-[#155727]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Danh mục
            </button>
            <button
              onClick={() => setActiveTab("products")}
              className={`pb-2 px-1 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors ${activeTab === "products" ? "border-[#155727] text-[#155727]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Quản lý món
            </button>
            <button
              onClick={() => setActiveTab("options")}
              className={`pb-2 px-1 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors ${activeTab === "options" ? "border-[#155727] text-[#155727]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Tùy chọn
            </button>
            
            <div className={`ml-auto mb-2 px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap shrink-0 ${isShopOpen(operatingHours.length ? operatingHours : DEFAULT_HOURS) ? 'bg-[#155727]/10 text-[#155727]' : 'bg-red-500/10 text-red-600'}`}>
              {isShopOpen(operatingHours.length ? operatingHours : DEFAULT_HOURS) ? '🟢 Đang mở cửa' : '🔴 Đang đóng cửa'}
            </div>
          </div>
        </header>

        {isFetching ? (
          <p className="text-center py-8">Đang tải...</p>
        ) : activeTab === "promotions" ? (
          <div className="grid gap-4">
            {promotions.map((promo) => (
              <div
                key={promo.id}
                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-start md:items-center"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        promo.isActive ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <h3 className="font-bold text-[#155727]">{promo.name}</h3>
                  </div>
                  <div className="text-sm space-y-1 mt-2 text-gray-600">
                    <p>
                      <span className="font-medium bg-gray-100 px-2 py-1 rounded-md text-xs inline-block mr-2 text-[#43281a]">
                        {TYPE_LABELS[promo.type]}
                      </span>
                    </p>
                    <p>
                      Điều kiện: Tối thiểu {promo.minQuantity} SP, hoặc đơn từ{" "}
                      {formatVND(promo.minOrderValue)}.
                    </p>
                    {promo.applicableProductIds?.length > 0 && (
                      <p>Áp dụng cho {promo.applicableProductIds.length} sản phẩm.</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto justify-end mt-2 md:mt-0">
                  <button
                    onClick={() => handleToggleActive(promo)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                      promo.isActive 
                        ? "border-[#155727] text-[#155727] hover:bg-green-50" 
                        : "border-gray-300 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {promo.isActive ? "Đang bật" : "Đã tắt"}
                  </button>
                  <button
                    onClick={() => openForm(promo)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(promo.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
            {promotions.length === 0 && (
              <p className="text-center py-8 text-gray-500">Chưa có chương trình khuyến mãi nào.</p>
            )}
          </div>
        ) : activeTab === "orders" ? (
          <div className="flex flex-col gap-6">
            <input
              type="search"
              placeholder="Tìm kiếm đơn hàng..."
              value={orderSearchQuery}
              onChange={(e) => setOrderSearchQuery(e.target.value)}
              className="w-full border rounded-xl p-3 outline-none focus:border-[#155727]"
            />
            <div className="grid gap-4">
              {orders
                .filter((o) => {
                  const q = normalizeVietnameseText(orderSearchQuery);
                  if (!q) return true;
                  return (
                    normalizeVietnameseText(o.customer_name).includes(q) ||
                    normalizeVietnameseText(o.customer_phone).includes(q) ||
                    normalizeVietnameseText(o.id?.toString()).includes(q)
                  );
                })
                .map((order) => (
                <div key={order.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-start md:items-center">
                  <div className="flex-1">
                    <h3 className="font-bold text-[#155727]">DH{order.id} - {order.customer_name}</h3>
                    <p className="text-sm text-gray-600">{order.customer_phone}</p>
                    <p className="text-sm font-medium mt-1">Tổng: {formatVND(order.total_amount || order.final_amount || 0)}</p>
                  </div>
                  <div className="w-full md:w-auto flex justify-end mt-2 md:mt-0">
                    <button
                      onClick={() => handleDeleteOrder(order.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      Xoá đơn
                    </button>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-center py-8 text-gray-500">Chưa có đơn hàng nào.</p>
              )}
            </div>
          </div>
        ) : activeTab === "hours" ? (
          <div className="flex flex-col gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-[#155727] mb-4 text-lg">Giờ hoạt động của quán</h3>
              <p className="text-sm text-gray-600 mb-6">Bạn có thể điều chỉnh giờ mở cửa và đóng cửa cho từng ngày trong tuần. Khách hàng vẫn có thể đặt trước khi tiệm đang nghỉ.</p>
              
              <div className="space-y-4">
                {operatingHours.length === 0 && <p className="text-gray-500 text-sm">Đang tải...</p>}
                {operatingHours.sort((a, b) => (a.day_of_week === 0 ? 7 : a.day_of_week) - (b.day_of_week === 0 ? 7 : b.day_of_week)).map((hour, idx) => (
                  <div key={hour.day_of_week} className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3 w-full md:w-1/3">
                      <input
                        type="checkbox"
                        checked={hour.is_open}
                        onChange={(e) => {
                          const newHours = [...operatingHours];
                          newHours[idx].is_open = e.target.checked;
                          setOperatingHours(newHours);
                        }}
                        className="w-4 h-4 accent-[#155727] rounded"
                        id={`day-${hour.day_of_week}`}
                      />
                      <label htmlFor={`day-${hour.day_of_week}`} className="font-medium text-gray-700 cursor-pointer min-w-[80px]">
                        {formatDayName(hour.day_of_week)}
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        disabled={!hour.is_open}
                        value={hour.open_time?.slice(0, 5) || "10:00"}
                        onChange={(e) => {
                          const newHours = [...operatingHours];
                          newHours[idx].open_time = e.target.value + ":00";
                          setOperatingHours(newHours);
                        }}
                        className="border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#155727] disabled:bg-gray-100 disabled:text-gray-400 w-28"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="time"
                        disabled={!hour.is_open}
                        value={hour.close_time?.slice(0, 5) || "18:00"}
                        onChange={(e) => {
                          const newHours = [...operatingHours];
                          newHours[idx].close_time = e.target.value + ":00";
                          setOperatingHours(newHours);
                        }}
                        className="border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#155727] disabled:bg-gray-100 disabled:text-gray-400 w-28"
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-8 pt-4 border-t flex justify-end">
                <button
                  onClick={async () => {
                    setIsSavingHours(true);
                    try {
                      await fetch("/api/admin/operating-hours", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(operatingHours)
                      });
                      alert("Đã lưu giờ hoạt động!");
                    } catch {
                      alert("Có lỗi khi lưu!");
                    } finally {
                      setIsSavingHours(false);
                    }
                  }}
                  disabled={isSavingHours}
                  className="bg-[#155727] text-white px-6 py-2.5 rounded-xl font-bold hover:bg-[#0f461e] disabled:opacity-50 transition-colors"
                >
                  {isSavingHours ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "products" ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3">
              {products.length === 0 && <p className="text-center py-8 text-gray-500">Chưa có món nào. Nhấn "+ Thêm món" để bắt đầu.</p>}
              {products.map((product: any) => (
                <div key={product.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex gap-4 items-center flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🍵</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${product.is_available ? "bg-green-500" : "bg-gray-400"}`} />
                        <h3 className="font-bold text-[#43281a] truncate">{product.name}</h3>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {product.family === "matcha" ? "Matcha" : "Houjicha"} · {Number(product.base_price).toLocaleString("vi-VN")}đ
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0 justify-end">
                    <button
                      onClick={async () => {
                        await fetch(`/api/admin/products/${product.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_available: !product.is_available }),
                        });
                        fetchProducts();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${product.is_available ? "bg-[#155727]/10 text-[#155727] hover:bg-[#155727]/20" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {product.is_available ? "● Đang bán" : "○ Đã tắt"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingProduct(product);
                        setProductForm({
                          name: product.name,
                          family: product.family,
                          base_price: product.base_price,
                          image: product.image || "",
                          is_available: product.is_available,
                        });
                        setIsProductModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Xoá món "${product.name}"? Đây là thao tác vĩnh viễn.`)) return;
                        await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
                        fetchProducts();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      Xoá
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === "categories" ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-3">
              {categories.length === 0 && <p className="text-center py-6 text-gray-400">Chưa tải được danh mục.</p>}
              {categories.map((cat: any) => (
                <div key={cat.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cat.is_available ? "bg-green-500" : "bg-gray-400"}`} />
                    <span className="font-semibold text-[#43281a]">{cat.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0 justify-end">
                    <button
                      onClick={async () => {
                        await fetch(`/api/admin/categories/${cat.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_available: !cat.is_available }),
                        });
                        fetchCategories();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${cat.is_available ? "bg-[#155727]/10 text-[#155727] hover:bg-[#155727]/20" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {cat.is_available ? "● Hiện" : "○ Ẩn"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingCategory(cat);
                        setCategoryForm({ name: cat.name, is_available: cat.is_available });
                        setIsCategoryModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Xoá danh mục "${cat.name}"? Đảm bảo không còn món nào trong danh mục này.`)) return;
                        await fetch(`/api/admin/categories/${cat.id}`, { method: "DELETE" });
                        fetchCategories();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      Xoá
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === "options" ? (
          <div className="flex flex-col gap-8">
            {[
              { id: "size", title: "Size" },
              { id: "powder", title: "Bột" },
              { id: "extra_powder", title: "Extra Bột (gam)" },
              { id: "milk", title: "Sữa" },
              { id: "sweetness", title: "Độ ngọt" },
              { id: "ice", title: "Đá" },
              { id: "topping", title: "Topping" },
            ].map(group => {
              const groupOptions = options.filter(o => o.option_group === group.id);
              return (
                <div key={group.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-[#155727]">{group.title}</h2>
                    <button
                      onClick={() => {
                        setEditingOption(null);
                        setOptionForm({
                          label: "", option_group: group.id, price: 0, extra_price: 0, is_available: true, is_default: false, category_ids: []
                        });
                        setIsOptionModalOpen(true);
                      }}
                      className="bg-[#155727] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90"
                    >
                      + Thêm
                    </button>
                  </div>
                  <div className="grid gap-2">
                    {groupOptions.length === 0 && <p className="text-sm text-gray-400 py-2">Chưa có dữ liệu</p>}
                    {groupOptions.map(opt => (
                      <div key={opt.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${opt.is_available ? "bg-green-500" : "bg-gray-400"}`} />
                            <span className="font-semibold text-[#43281a] text-sm truncate">{opt.label}</span>
                            {opt.is_default && <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">Mặc định</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {opt.price > 0 && <span>+{Number(opt.price).toLocaleString("vi-VN")}đ</span>}
                            {opt.extra_price > 0 && <span>+{Number(opt.extra_price).toLocaleString("vi-VN")}đ/g</span>}
                            {(group.id === "powder" || group.id === "topping" || group.id === "milk") && opt.category_ids?.length > 0 && (
                              <span className="text-green-700 w-full sm:w-auto">
                                Áp dụng: {opt.category_ids.map((cid: string) => categories.find(c => c.id === cid)?.name || cid).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:shrink-0 justify-end">
                          <button
                            onClick={async () => {
                              await fetch(`/api/admin/options/${opt.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ is_available: !opt.is_available }),
                              });
                              fetchOptions();
                            }}
                            className={`px-2 py-1 rounded text-xs font-bold ${opt.is_available ? "bg-[#155727]/10 text-[#155727]" : "bg-gray-100 text-gray-500"}`}
                          >
                            {opt.is_available ? "Hiện" : "Ẩn"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingOption(opt);
                              setOptionForm({ ...opt, category_ids: opt.category_ids || [] });
                              setIsOptionModalOpen(true);
                            }}
                            className="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-600"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Xoá "${opt.label}"?`)) return;
                              await fetch(`/api/admin/options/${opt.id}`, { method: "DELETE" });
                              fetchOptions();
                            }}
                            className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-600"
                          >
                            Xoá
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] flex flex-col">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const method = editingCategory ? "PATCH" : "POST";
                const url = editingCategory
                  ? `/api/admin/categories/${editingCategory.id}`
                  : "/api/admin/categories";
                const res = await fetch(url, {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(categoryForm),
                });
                if (res.ok) {
                  setIsCategoryModalOpen(false);
                  fetchCategories();
                } else {
                  const err = await res.json();
                  alert(err.error || "Có lỗi xảy ra");
                }
              }}
              className="p-4 md:p-6 flex flex-col gap-4 overflow-y-auto hide-scrollbar"
            >
              <h2 className="text-xl font-bold text-[#155727]">
                {editingCategory ? "Sửa danh mục" : "Thêm danh mục"}
              </h2>

              <div>
                <label className="block text-sm font-medium mb-1">Tên danh mục *</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="category-available"
                  checked={categoryForm.is_available}
                  onChange={(e) => setCategoryForm({ ...categoryForm, is_available: e.target.checked })}
                  className="w-4 h-4 accent-[#155727]"
                />
                <label htmlFor="category-available" className="text-sm font-medium cursor-pointer">Đang hoạt động</label>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 font-medium hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#155727] text-white font-medium hover:opacity-90"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Option Modal */}
      {isOptionModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] flex flex-col">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const method = editingOption ? "PATCH" : "POST";
                const url = editingOption
                  ? `/api/admin/options/${editingOption.id}`
                  : "/api/admin/options";
                const res = await fetch(url, {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...optionForm,
                    price: Number(optionForm.price),
                    extra_price: Number(optionForm.extra_price),
                  }),
                });
                if (res.ok) {
                  setIsOptionModalOpen(false);
                  fetchOptions();
                } else {
                  const err = await res.json();
                  alert(err.error || "Có lỗi xảy ra");
                }
              }}
              className="p-4 md:p-6 flex flex-col gap-4 overflow-y-auto hide-scrollbar"
            >
              <h2 className="text-xl font-bold text-[#155727]">
                {editingOption ? "Sửa tùy chọn" : "Thêm tùy chọn mới"}
              </h2>

              <div>
                <label className="block text-sm font-medium mb-1">Tên tùy chọn *</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                  value={optionForm.label}
                  onChange={(e) => setOptionForm({ ...optionForm, label: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Giá cộng thêm (VND) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                  value={optionForm.price}
                  onChange={(e) => setOptionForm({ ...optionForm, price: e.target.value })}
                />
              </div>

              {optionForm.option_group === "powder" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Giá phụ trội mỗi gam (VND)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                    value={optionForm.extra_price}
                    onChange={(e) => setOptionForm({ ...optionForm, extra_price: e.target.value })}
                  />
                </div>
              )}

              {(optionForm.option_group === "powder" || optionForm.option_group === "topping" || optionForm.option_group === "milk") && (
                <div>
                  <label className="block text-sm font-medium mb-2">Danh mục áp dụng (bắt buộc)</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded-xl bg-gray-50">
                    {categories.map(c => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={optionForm.category_ids?.includes(c.id) || false}
                          onChange={(e) => {
                            const newIds = e.target.checked
                              ? [...(optionForm.category_ids || []), c.id]
                              : (optionForm.category_ids || []).filter((id: string) => id !== c.id);
                            setOptionForm({ ...optionForm, category_ids: newIds });
                          }}
                          className="w-4 h-4 accent-[#155727]"
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="option-available"
                  checked={optionForm.is_available}
                  onChange={(e) => setOptionForm({ ...optionForm, is_available: e.target.checked })}
                  className="w-4 h-4 accent-[#155727]"
                />
                <label htmlFor="option-available" className="text-sm font-medium cursor-pointer">Đang hiện cho khách</label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="option-default"
                  checked={optionForm.is_default}
                  onChange={(e) => setOptionForm({ ...optionForm, is_default: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <label htmlFor="option-default" className="text-sm font-medium cursor-pointer">Chọn làm mặc định (cho nhóm này)</label>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsOptionModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 font-medium hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#155727] text-white font-medium hover:opacity-90"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const method = editingProduct ? "PATCH" : "POST";
                const url = editingProduct
                  ? `/api/admin/products/${editingProduct.id}`
                  : "/api/admin/products";
                const res = await fetch(url, {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...productForm,
                    base_price: Number(productForm.base_price),
                    image: productForm.image || null,
                  }),
                });
                if (res.ok) {
                  setIsProductModalOpen(false);
                  fetchProducts();
                } else {
                  const err = await res.json();
                  alert(err.error || "Có lỗi xảy ra");
                }
              }}
              className="p-4 md:p-6 flex flex-col gap-4 overflow-y-auto hide-scrollbar"
            >
              <h2 className="text-xl font-bold text-[#155727]">
                {editingProduct ? "Sửa món" : "Thêm món mới"}
              </h2>

              <div>
                <label className="block text-sm font-medium mb-1">Tên món *</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Danh mục</label>
                  <select
                    className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                    value={productForm.family}
                    onChange={(e) => setProductForm({ ...productForm, family: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {categories.length === 0 && (
                      <>
                        <option value="matcha">Matcha</option>
                        <option value="houjicha">Houjicha</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Giá M (VND) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1000"
                    className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                    value={productForm.base_price}
                    onChange={(e) => setProductForm({ ...productForm, base_price: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-1">Size L = Giá M + 5.000đ</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Ảnh món</label>
                <div className="flex items-center gap-4">
                  {productForm.image ? (
                    <div className="relative h-20 w-20 rounded-lg overflow-hidden border bg-gray-50 shrink-0">
                      <img src={productForm.image} alt="preview" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <button
                        type="button"
                        onClick={() => setProductForm({ ...productForm, image: "" })}
                        className="absolute top-1 right-1 bg-white/80 hover:bg-white text-red-500 rounded-full p-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="h-20 w-20 rounded-lg border border-dashed flex items-center justify-center text-gray-400 bg-gray-50 shrink-0">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z"></path></svg>
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg, image/png, image/webp"
                      disabled={isUploadingImage}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#155727]/10 file:text-[#155727] hover:file:bg-[#155727]/20 cursor-pointer"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          alert("Kích thước file không được vượt quá 5MB");
                          e.target.value = "";
                          return;
                        }
                        try {
                          setIsUploadingImage(true);
                          const formData = new FormData();
                          formData.append("file", file);
                          const res = await fetch("/api/admin/upload", {
                            method: "POST",
                            body: formData,
                          });
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error || "Lỗi upload");
                          }
                          const data = await res.json();
                          setProductForm({ ...productForm, image: data.url });
                        } catch (err: any) {
                          alert(err.message || "Đã có lỗi khi upload ảnh");
                        } finally {
                          setIsUploadingImage(false);
                          e.target.value = "";
                        }
                      }}
                    />
                    {isUploadingImage && <p className="text-xs text-[#155727] mt-2 font-medium">Đang tải ảnh lên...</p>}
                    <p className="text-xs text-gray-400 mt-2">Hỗ trợ: JPG, PNG, WebP (Tối đa 5MB)</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="product-available"
                  checked={productForm.is_available}
                  onChange={(e) => setProductForm({ ...productForm, is_available: e.target.checked })}
                  className="w-4 h-4 accent-[#155727]"
                />
                <label htmlFor="product-available" className="text-sm font-medium cursor-pointer">Đang bán</label>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 font-medium hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isUploadingImage}
                  className="px-4 py-2 rounded-xl bg-[#155727] text-white font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isUploadingImage ? "Đang tải ảnh..." : "Lưu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
            <form onSubmit={handleSubmit} className="p-4 md:p-6 flex flex-col gap-4 overflow-y-auto hide-scrollbar">
              <h2 className="text-xl font-bold text-[#155727]">
                {editingPromo ? "Sửa khuyến mãi" : "Thêm khuyến mãi"}
              </h2>

              <div className="grid gap-4 mt-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Tên chương trình *</label>
                  <input
                    type="text"
                    required
                    className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Loại khuyến mãi</label>
                    <select
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as PromoType })}
                    >
                      {Object.entries(TYPE_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Phạm vi áp dụng</label>
                    <select
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.scope}
                      onChange={(e) => {
                        const newScope = e.target.value as "all" | "products" | "categories";
                        setFormData({ 
                          ...formData, 
                          scope: newScope,
                          applicableProductIds: newScope === "products" && formData.applicableProductIds?.length === 0 && products.length > 0 ? [products[0].id] : (formData.applicableProductIds || []),
                          applicableCategoryIds: newScope === "categories" && formData.applicableCategoryIds?.length === 0 && categories.length > 0 ? [categories[0].id] : (formData.applicableCategoryIds || []),
                        });
                      }}
                    >
                      <option value="all">Tất cả sản phẩm</option>
                      <option value="products">Sản phẩm cụ thể</option>
                      <option value="categories">Danh mục</option>
                    </select>
                  </div>
                </div>

                {formData.scope === "products" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Chọn sản phẩm áp dụng</label>
                    {products.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">Chưa có sản phẩm nào trong hệ thống.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border rounded-xl p-3 space-y-2 bg-gray-50">
                        {products.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-[#155727]">
                            <input
                              type="checkbox"
                              checked={formData.applicableProductIds?.includes(p.id)}
                              onChange={(e) => {
                                const ids = formData.applicableProductIds || [];
                                if (e.target.checked) {
                                  setFormData({ ...formData, applicableProductIds: [...ids, p.id] });
                                } else {
                                  setFormData({ ...formData, applicableProductIds: ids.filter(id => id !== p.id) });
                                }
                              }}
                              className="accent-[#155727] w-4 h-4"
                            />
                            <span>
                              <span className="font-medium">{p.name}</span>
                              <span className="text-gray-500 text-xs ml-2">({categories.find(c => c.id === p.family)?.name || p.family})</span>
                              {!p.is_available && <span className="text-red-500 text-xs ml-2">[Ngừng bán]</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {formData.scope === "categories" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Chọn danh mục áp dụng</label>
                    {categories.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">Chưa có danh mục nào trong hệ thống.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border rounded-xl p-3 space-y-2 bg-gray-50">
                        {categories.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-[#155727]">
                            <input
                              type="checkbox"
                              checked={formData.applicableCategoryIds?.includes(c.id)}
                              onChange={(e) => {
                                const ids = formData.applicableCategoryIds || [];
                                if (e.target.checked) {
                                  setFormData({ ...formData, applicableCategoryIds: [...ids, c.id] });
                                } else {
                                  setFormData({ ...formData, applicableCategoryIds: ids.filter(id => id !== c.id) });
                                }
                              }}
                              className="accent-[#155727] w-4 h-4"
                            />
                            <span className="font-medium">{c.name}</span>
                            {!c.is_available && <span className="text-red-500 text-xs ml-2">[Đang ẩn]</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Dynamic fields */}
                {formData.type === "percentage" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Phần trăm giảm (%) *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.discountPercentage || ""}
                      onChange={(e) => setFormData({ ...formData, discountPercentage: Number(e.target.value) })}
                    />
                  </div>
                )}

                {formData.type === "fixed_amount" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Số tiền giảm (đ) *</label>
                    <input
                      type="number"
                      required
                      min={1000}
                      step={1000}
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.discountAmount || ""}
                      onChange={(e) => setFormData({ ...formData, discountAmount: Number(e.target.value) })}
                    />
                  </div>
                )}

                {formData.type === "buy_x_get_y" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Mua (SL) *</label>
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                        value={formData.buyQuantity || ""}
                        onChange={(e) => setFormData({ ...formData, buyQuantity: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Tặng (SL) *</label>
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                        value={formData.getQuantity || ""}
                        onChange={(e) => setFormData({ ...formData, getQuantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">Sản phẩm được tặng *</label>
                      <select
                        required
                        className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                        value={formData.getFreeProductId || ""}
                        onChange={(e) => setFormData({ ...formData, getFreeProductId: e.target.value })}
                      >
                        <option value="">-- Chọn sản phẩm --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">SL tối thiểu</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.minQuantity || 0}
                      onChange={(e) => setFormData({ ...formData, minQuantity: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Giá trị đơn tối thiểu (đ)</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.minOrderValue || 0}
                      onChange={(e) => setFormData({ ...formData, minOrderValue: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Ngày bắt đầu</label>
                    <input
                      type="date"
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.startDate || ""}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Ngày kết thúc</label>
                    <input
                      type="date"
                      className="w-full border rounded-xl p-2 outline-none focus:border-[#155727]"
                      value={formData.endDate || ""}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-[#155727]"
                    checked={formData.canCombine || false}
                    onChange={(e) => setFormData({ ...formData, canCombine: e.target.checked })}
                  />
                  <span className="text-sm font-medium">Cho phép kết hợp với KM khác</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 font-medium hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#155727] text-white font-medium hover:opacity-90"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
