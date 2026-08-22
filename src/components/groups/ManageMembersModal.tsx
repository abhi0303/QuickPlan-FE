import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Crown, LoaderCircle, LogOut, UserMinus, UserPlus, X } from 'lucide-react'
import { MultiSelect } from '../common/MultiSelect'
import { avatarStyle } from '../../utils/avatar'
import { getApiErrorMessage } from '../../services/api'
import { listFriends } from '../../services/friends'
import type { Friend } from '../../services/friends'
import type { Group, GroupRole } from '../../services/groups'
import './ManageMembersModal.scss'

type Props = {
  open: boolean
  group: Group
  currentUserId: string
  busyId: string
  onClose: () => void
  onInvite: (memberIds: string[]) => Promise<void>
  onRemove: (memberId: string) => Promise<boolean>
  onRole: (memberId: string, role: GroupRole) => Promise<void>
}

export function ManageMembersModal({
  open, group, currentUserId, busyId, onClose, onInvite, onRemove, onRole,
}: Props) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)

  const isOwner = group.myRole === 'OWNER'
  const ownerCount = group.members.filter((m) => m.role === 'OWNER').length

  useEffect(() => {
    if (!open) return
    listFriends().then(setFriends).catch(() => setFriends([]))

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const memberIds = new Set(group.members.map((m) => m.id))
  const invitable = friends.filter((f) => !memberIds.has(f.id))

  async function invite() {
    if (selected.length === 0) return
    setInviting(true)
    try {
      await onInvite(selected)
      toast.success(`Added ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`)
      setSelected([])
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not add those members.'))
    } finally {
      setInviting(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal members-modal" role="dialog" aria-modal="true" aria-labelledby="members-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="members-title">Members</h2>
            <p className="muted">{group.name}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="members-current">
          {group.members.map((member) => {
            const isMe = member.id === currentUserId
            // the API keeps at least one owner, so never offer the last demotion
            const lastOwner = member.role === 'OWNER' && ownerCount === 1
            return (
              <div className="member-row" key={member.id}>
                <span className="friend-avatar" style={avatarStyle(member.name)}>{member.name.charAt(0).toUpperCase()}</span>
                <div className="friend-copy">
                  <strong>{isMe ? 'You' : member.name}</strong>
                  <small>{member.email}</small>
                </div>

                {isOwner && !lastOwner && (
                  <button
                    className={`role-toggle ${member.role === 'OWNER' ? 'is-owner' : ''}`}
                    onClick={() => onRole(member.id, member.role === 'OWNER' ? 'MEMBER' : 'OWNER')}
                    disabled={busyId === member.id}
                    title={member.role === 'OWNER' ? 'Change to member' : 'Make owner'}
                  >
                    <Crown size={12} /> {member.role === 'OWNER' ? 'Owner' : 'Member'}
                  </button>
                )}
                {(!isOwner || lastOwner) && (
                  <span className={`role-static ${member.role === 'OWNER' ? 'is-owner' : ''}`}>
                    {member.role === 'OWNER' && <Crown size={12} />} {member.role === 'OWNER' ? 'Owner' : 'Member'}
                  </span>
                )}

                {(isOwner || isMe) && !lastOwner && (
                  <button
                    className="member-remove"
                    onClick={() => onRemove(member.id)}
                    disabled={busyId === member.id}
                    aria-label={isMe ? 'Leave this group' : `Remove ${member.name}`}
                    title={isMe ? 'Leave this group' : `Remove ${member.name}`}
                  >
                    {busyId === member.id
                      ? <LoaderCircle size={15} className="spin" />
                      : isMe ? <LogOut size={15} /> : <UserMinus size={15} />}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {isOwner && (
          <div className="members-add">
            <h3><UserPlus size={14} /> Add from your friends</h3>

            {invitable.length === 0 ? (
              <p className="field-hint">
                {friends.length === 0
                  ? <>You have no friends yet. <Link to="/people">Add some first</Link>, then you can put them in this group.</>
                  : 'Everyone you are friends with is already in this group.'}
              </p>
            ) : (
              <>
                <MultiSelect
                  options={invitable.map((friend) => ({ id: friend.id, label: friend.name, sublabel: friend.email }))}
                  selected={selected}
                  onChange={setSelected}
                  placeholder="Search and pick friends"
                  searchPlaceholder="Search friends..."
                  disabled={inviting}
                  label="Add members"
                />

                <button type="button" className="modal-submit" onClick={invite} disabled={inviting || selected.length === 0}>
                  {inviting
                    ? <><LoaderCircle size={18} className="spin" /> Adding...</>
                    : <><UserPlus size={18} /> Add {selected.length || ''} {selected.length === 1 ? 'person' : 'people'}</>}
                </button>
              </>
            )}
          </div>
        )}

        {!isOwner && (
          <p className="field-hint members-note">
            Only an owner can add or remove other people. You can leave the group using the button beside your name.
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
