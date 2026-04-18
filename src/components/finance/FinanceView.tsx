import { useState } from "react";
import { motion } from "framer-motion";
import { Settings2 } from "lucide-react";
import { useFinanceState, TransactionType } from "@/hooks/useFinanceState";
import FinanceOverview from "./FinanceOverview";
import FinanceTransactions from "./FinanceTransactions";
import FinanceSubscriptions from "./FinanceSubscriptions";
import FinanceLoans from "./FinanceLoans";
import AddTransactionModal from "./AddTransactionModal";
import FinanceCategoriesModal from "./FinanceCategoriesModal";

type SubTab = "overview" | "transactions" | "subscriptions" | "loans";

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📈" },
  { id: "transactions", label: "Transactions", icon: "💸" },
  { id: "subscriptions", label: "Subscriptions", icon: "🔁" },
  { id: "loans", label: "Loans", icon: "🤝" },
];

export default function FinanceView() {
  const finance = useFinanceState();
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<TransactionType>("expense");
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const openModal = (type?: TransactionType) => {
    setModalDefaultType(type || "expense");
    setModalOpen(true);
  };

  const outstandingLoansTotal = finance.outstandingLoans.reduce((s, l) => s + l.amount, 0);

  if (finance.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/30 border border-border w-fit">
          {SUB_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                subTab === tab.id
                  ? "gradient-purple text-primary-foreground glow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCategoriesOpen(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/30 border border-border hover:border-primary/50 text-xs font-semibold text-foreground transition-all"
          title="Manage categories"
        >
          <Settings2 className="w-3.5 h-3.5" /> Categories
        </button>
      </div>

      {/* Content */}
      {subTab === "overview" && (
        <FinanceOverview
          monthlyData={finance.monthlyData}
          currentMonthTotals={finance.currentMonthTotals}
          subscriptionTotal={finance.subscriptionTotal}
          biggestExpenseCategory={finance.biggestExpenseCategory}
          outstandingLoansTotal={outstandingLoansTotal}
        />
      )}

      {subTab === "transactions" && (
        <FinanceTransactions
          transactions={finance.transactions}
          onDelete={finance.deleteTransaction}
          onAdd={() => openModal("expense")}
          currentMonth={finance.currentMonth}
        />
      )}

      {subTab === "subscriptions" && (
        <FinanceSubscriptions
          subscriptions={finance.activeSubscriptions}
          total={finance.subscriptionTotal}
          onDelete={finance.deleteTransaction}
          onAdd={() => openModal("subscription")}
        />
      )}

      {subTab === "loans" && (
        <FinanceLoans
          loans={finance.outstandingLoans}
          onSettle={(id) => finance.updateTransaction(id, { is_settled: true })}
          onDelete={finance.deleteTransaction}
          onAdd={() => openModal("loan_out")}
        />
      )}

      <AddTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={finance.addTransaction}
        defaultType={modalDefaultType}
        onManageCategories={() => setCategoriesOpen(true)}
      />

      <FinanceCategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        initialKind={modalDefaultType === "income" ? "income" : "expense"}
      />
    </motion.div>
  );
}
