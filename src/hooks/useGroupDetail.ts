import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { useAppStore } from '../store/useAppStore'
import {
  createSettlement, deleteExpense, getGroupBalances, listGroupExpenses, listSettlements,
} from '../services/expenses'
import type { CreateSettlementPayload, Expense, GroupBalances, Settlement } from '../services/expenses'
import { addMembers, getGroup, removeMember, setMemberRole } from '../services/groups'
import type { Group, GroupRole } from '../services/groups'

/**
 * Everything one group screen needs.
 *
 * A non-member gets 404 rather than 403 — the API denies the group exists at
 * all — so "not found" and "no permission" are deliberately not distinguished.
 */
export function useGroupDetail(groupId: string) {
  const [group, setGroup] = useState<Group | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [balances, setBalances] = useState<GroupBalances | null>(null)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [version, setVersion] = useState(0)
  // the header's refresh asks every list to fetch again
  const dataVersion = useAppStore((state) => state.dataVersion)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getGroup(groupId),
      listGroupExpenses(groupId, { limit: 100 }),
      getGroupBalances(groupId),
      listSettlements(groupId),
    ])
      .then(([g, page, bal, paid]) => {
        if (cancelled) return
        setGroup(g)
        setExpenses(page.items)
        setBalances(bal)
        setSettlements(paid)
        setError('')
      })
      .catch((e) => {
        if (!cancelled) setError(getApiErrorMessage(e, 'This group is not available.'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [groupId, version, dataVersion])

  function refresh() { setVersion((v) => v + 1) }

  function retry() {
    setLoading(true)
    setError('')
    refresh()
  }

  async function removeExpense(expense: Expense) {
    setBusyId(expense.id)
    try {
      await deleteExpense(expense.id)
      refresh()
      toast.success('Expense deleted')
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not delete that expense.'))
    } finally {
      setBusyId('')
    }
  }

  /** Reports whether it landed, so a dialog can stay open on failure. */
  async function settle(payload: CreateSettlementPayload): Promise<boolean> {
    setBusyId(payload.toUserId)
    try {
      await createSettlement(groupId, payload)
      refresh()
      toast.success('Payment recorded')
      return true
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not record that payment.'))
      return false
    } finally {
      setBusyId('')
    }
  }

  async function invite(memberIds: string[]) {
    await addMembers(groupId, memberIds)
    refresh()
  }

  /**
   * Also used to leave: a member removing themselves is the leave action.
   * The API refuses to remove someone with an outstanding balance, and refuses
   * to remove the last owner — both come back as 400 with a readable message.
   */
  async function kick(memberId: string) {
    setBusyId(memberId)
    try {
      await removeMember(groupId, memberId)
      refresh()
      return true
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not remove that member.'))
      return false
    } finally {
      setBusyId('')
    }
  }

  async function changeRole(memberId: string, role: GroupRole) {
    setBusyId(memberId)
    try {
      await setMemberRole(groupId, memberId, role)
      refresh()
      toast.success(role === 'OWNER' ? 'Promoted to owner' : 'Changed to member')
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not change that role.'))
    } finally {
      setBusyId('')
    }
  }

  return {
    group, expenses, balances, settlements, loading, error, busyId,
    retry, refresh, removeExpense, settle, invite, kick, changeRole,
  }
}
