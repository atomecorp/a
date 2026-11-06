//! The confinement a vault process puts itself in on Linux, once started under
//! its own account by the supervisor and before it opens its database: no new
//! privileges, resource limits, Landlock (the file system shrinks to its own
//! vault directory) and a seccomp allow-list (no socket, no process, no exec,
//! no executable memory). Every step is required: a kernel that cannot enforce
//! one refuses the vault's start.
//!
//! Landlock reaches /proc, /sys and every other path; seccomp forbids the
//! sockets, IPC and process calls; namespaces would add nothing to them and
//! need unsafe code (`unshare`), which this workspace denies.
#![cfg(target_os = "linux")]

use landlock::{
    ABI, Access, AccessFs, CompatLevel, Compatible, PathBeneath, PathFd, Ruleset, RulesetAttr,
    RulesetCreatedAttr, RulesetStatus,
};
use rustix::process::{Resource, Rlimit, setrlimit};
use seccompiler::{
    BpfProgram, SeccompAction, SeccompCmpArgLen, SeccompCmpOp, SeccompCondition, SeccompFilter,
    SeccompRule, TargetArch,
};
use std::collections::BTreeMap;
use std::path::Path;

// What one person's vault ever needs open at once: its database, journal, WAL,
// shared memory and the standard streams.
const OPEN_FILES: u64 = 64;
// A bound on a runaway vault (the largest reply is 256 MB).
const ADDRESS_SPACE: u64 = 4 << 30;

pub fn confine_vault(directory: &Path) -> Result<(), String> {
    rustix::thread::set_no_new_privs(true)
        .map_err(|e| format!("vault_confinement_no_new_privs:{e}"))?;
    limit_resources()?;
    restrict_file_system(directory)?;
    allow_only_vault_calls()
}

fn limit_resources() -> Result<(), String> {
    for (resource, value) in [
        (Resource::Nofile, OPEN_FILES),
        (Resource::As, ADDRESS_SPACE),
        (Resource::Core, 0),
    ] {
        setrlimit(
            resource,
            Rlimit {
                current: Some(value),
                maximum: Some(value),
            },
        )
        .map_err(|e| format!("vault_confinement_rlimit:{resource:?}:{e}"))?;
    }
    Ok(())
}

// Landlock ABI 2 (Linux 5.19) at least: files are read, written, created and
// removed under the vault directory only; nothing is executed, linked, renamed
// across directories or made a device, socket or pipe anywhere.
fn restrict_file_system(directory: &Path) -> Result<(), String> {
    let error = |e: &dyn std::fmt::Display| format!("vault_confinement_landlock:{e}");
    let allowed = AccessFs::ReadFile
        | AccessFs::WriteFile
        | AccessFs::ReadDir
        | AccessFs::RemoveFile
        | AccessFs::MakeReg
        | AccessFs::MakeDir;
    let status = Ruleset::default()
        .set_compatibility(CompatLevel::HardRequirement)
        .handle_access(AccessFs::from_all(ABI::V2))
        .map_err(|e| error(&e))?
        .create()
        .map_err(|e| error(&e))?
        .add_rule(PathBeneath::new(
            PathFd::new(directory).map_err(|e| error(&e))?,
            allowed,
        ))
        .map_err(|e| error(&e))?
        .restrict_self()
        .map_err(|e| error(&e))?;
    if status.ruleset != RulesetStatus::FullyEnforced {
        return Err("vault_confinement_landlock:not_enforced".into());
    }
    Ok(())
}

#[cfg(target_arch = "x86_64")]
const ARCH: TargetArch = TargetArch::x86_64;
#[cfg(target_arch = "aarch64")]
const ARCH: TargetArch = TargetArch::aarch64;

// The calls of SQLite's unix VFS, the Rust runtime and the standard streams.
const CALLS: &[libc::c_long] = &[
    libc::SYS_read,
    libc::SYS_write,
    libc::SYS_readv,
    libc::SYS_writev,
    libc::SYS_pread64,
    libc::SYS_pwrite64,
    libc::SYS_lseek,
    libc::SYS_close,
    libc::SYS_openat,
    libc::SYS_fstat,
    libc::SYS_newfstatat,
    libc::SYS_statx,
    libc::SYS_fstatfs,
    libc::SYS_faccessat,
    libc::SYS_faccessat2,
    libc::SYS_readlinkat,
    libc::SYS_getcwd,
    libc::SYS_getdents64,
    libc::SYS_unlinkat,
    libc::SYS_mkdirat,
    libc::SYS_fchmod,
    libc::SYS_fcntl,
    libc::SYS_fsync,
    libc::SYS_fdatasync,
    libc::SYS_ftruncate,
    libc::SYS_fallocate,
    libc::SYS_brk,
    libc::SYS_munmap,
    libc::SYS_mremap,
    libc::SYS_madvise,
    libc::SYS_futex,
    libc::SYS_sched_yield,
    libc::SYS_getrandom,
    libc::SYS_clock_gettime,
    libc::SYS_clock_getres,
    libc::SYS_gettimeofday,
    libc::SYS_nanosleep,
    libc::SYS_clock_nanosleep,
    libc::SYS_getpid,
    libc::SYS_gettid,
    libc::SYS_getuid,
    libc::SYS_geteuid,
    libc::SYS_getgid,
    libc::SYS_getegid,
    libc::SYS_rt_sigreturn,
    libc::SYS_rt_sigprocmask,
    libc::SYS_rt_sigaction,
    libc::SYS_sigaltstack,
    libc::SYS_restart_syscall,
    libc::SYS_exit,
    libc::SYS_exit_group,
];

// The same calls under their former x86_64 names, which a C library may still use.
#[cfg(target_arch = "x86_64")]
const LEGACY_CALLS: &[libc::c_long] = &[
    libc::SYS_open,
    libc::SYS_stat,
    libc::SYS_lstat,
    libc::SYS_access,
    libc::SYS_readlink,
    libc::SYS_unlink,
    libc::SYS_mkdir,
    libc::SYS_time,
];
#[cfg(target_arch = "aarch64")]
const LEGACY_CALLS: &[libc::c_long] = &[];

fn allow_only_vault_calls() -> Result<(), String> {
    let error = |e: &dyn std::fmt::Display| format!("vault_confinement_seccomp:{e}");
    let condition = |index, operator, value| {
        SeccompCondition::new(index, SeccompCmpArgLen::Dword, operator, value)
    };
    let mut rules: BTreeMap<i64, Vec<SeccompRule>> = CALLS
        .iter()
        .chain(LEGACY_CALLS)
        .map(|call| (*call, Vec::new()))
        .collect();
    // Memory is mapped and protected, never executable.
    for call in [libc::SYS_mmap, libc::SYS_mprotect] {
        let not_executable = condition(2, SeccompCmpOp::MaskedEq(libc::PROT_EXEC as u64), 0)
            .map_err(|e| error(&e))?;
        rules.insert(
            call,
            vec![SeccompRule::new(vec![not_executable]).map_err(|e| error(&e))?],
        );
    }
    // A signal only to itself (an abort).
    let own = condition(
        0,
        SeccompCmpOp::Eq,
        rustix::process::getpid().as_raw_nonzero().get() as u64,
    )
    .map_err(|e| error(&e))?;
    rules.insert(
        libc::SYS_tgkill,
        vec![SeccompRule::new(vec![own]).map_err(|e| error(&e))?],
    );
    let filter = SeccompFilter::new(
        rules,
        SeccompAction::Errno(libc::EPERM as u32),
        SeccompAction::Allow,
        ARCH,
    )
    .map_err(|e| error(&e))?;
    let program: BpfProgram = filter
        .try_into()
        .map_err(|e: seccompiler::BackendError| error(&e))?;
    seccompiler::apply_filter(&program).map_err(|e| error(&e))
}
